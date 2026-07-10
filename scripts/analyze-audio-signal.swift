import AVFoundation
import Foundation

struct AudioSignal: Codable {
    let path: String
    let duration: Double
    let peak: Double
    let rms: Double
    let peakDb: Double
    let rmsDb: Double
    let frames: Int
    let error: String?
}

func decibels(_ value: Double) -> Double {
    if value <= 0 {
        return -999
    }

    return 20 * log10(value)
}

let filePaths = Array(CommandLine.arguments.dropFirst())

if filePaths.isEmpty {
    fputs("Usage: swift scripts/analyze-audio-signal.swift <audio-file> [...]\n", stderr)
    exit(2)
}

let results = filePaths.map { filePath -> AudioSignal in
    do {
        let fileUrl = URL(fileURLWithPath: filePath)
        let audioFile = try AVAudioFile(forReading: fileUrl)
        guard
            let format = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: audioFile.processingFormat.sampleRate,
                channels: audioFile.processingFormat.channelCount,
                interleaved: false
            ),
            let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(audioFile.length)
            )
        else {
            return AudioSignal(
                path: filePath,
                duration: 0,
                peak: 0,
                rms: 0,
                peakDb: -999,
                rmsDb: -999,
                frames: 0,
                error: "Could not create PCM analysis buffer."
            )
        }

        try audioFile.read(into: buffer)

        let channelCount = Int(buffer.format.channelCount)
        let frameCount = Int(buffer.frameLength)
        var peak: Float = 0
        var sumSquares = 0.0
        var sampleCount = 0

        for channelIndex in 0..<channelCount {
            guard let channelData = buffer.floatChannelData?[channelIndex] else {
                continue
            }

            for frameIndex in 0..<frameCount {
                let sample = channelData[frameIndex]
                let absoluteSample = abs(sample)

                if absoluteSample > peak {
                    peak = absoluteSample
                }

                sumSquares += Double(sample * sample)
                sampleCount += 1
            }
        }

        let rms = sqrt(sumSquares / Double(max(sampleCount, 1)))
        let duration = Double(frameCount) / format.sampleRate

        return AudioSignal(
            path: filePath,
            duration: duration,
            peak: Double(peak),
            rms: rms,
            peakDb: decibels(Double(peak)),
            rmsDb: decibels(rms),
            frames: frameCount,
            error: nil
        )
    } catch {
        return AudioSignal(
            path: filePath,
            duration: 0,
            peak: 0,
            rms: 0,
            peakDb: -999,
            rmsDb: -999,
            frames: 0,
            error: String(describing: error)
        )
    }
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(results)
print(String(data: data, encoding: .utf8) ?? "[]")
