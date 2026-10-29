import AVFoundation
import ExpoModulesCore
import Speech

/// On-device transcription of a video's speech: the audio track is converted to 16 kHz mono
/// PCM, then recognised by Apple Speech with `requiresOnDeviceRecognition` (nothing leaves the
/// phone). Only the speech recognition permission is needed (no microphone).
public class VideoSpeechModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoSpeech")

    AsyncFunction("transcribe") { (videoUri: URL, language: String, promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
          promise.reject("ERR_PERMISSION", "Speech recognition is not allowed for this app.")
          return
        }
        DispatchQueue.global(qos: .userInitiated).async {
          let wav: URL
          do {
            wav = try SpeechAudio.extract(from: videoUri)
          } catch let error as VideoSpeechError {
            promise.reject(error.code, error.message)
            return
          } catch {
            promise.reject("ERR_TRANSCRIBE", error.localizedDescription)
            return
          }
          Recognition.run(wav: wav, language: language) { result in
            try? FileManager.default.removeItem(at: wav)
            switch result {
            case .success(let lines): promise.resolve(lines)
            case .failure(let error): promise.reject(error.code, error.message)
            }
          }
        }
      }
    }
  }
}

struct VideoSpeechError: Error {
  let code: String
  let message: String
}

/// Audio track of a video → 16 kHz, mono, 16-bit PCM WAV file in the caches folder.
enum SpeechAudio {
  static func extract(from video: URL) throws -> URL {
    let asset = AVURLAsset(url: video)
    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw VideoSpeechError(code: "ERR_NO_AUDIO", message: "This video has no sound.")
    }
    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw VideoSpeechError(code: "ERR_TRANSCRIBE", message: "Cannot read this video.")
    }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 16_000,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    reader.add(output)
    guard reader.startReading() else {
      throw VideoSpeechError(code: "ERR_TRANSCRIBE", message: "Cannot read this video's sound.")
    }
    var pcm = Data()
    // At most 10 minutes of speech (a recipe video is much shorter).
    let maxBytes = 16_000 * 2 * 600
    while let sample = output.copyNextSampleBuffer(), pcm.count < maxBytes {
      guard let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      var chunk = Data(count: length)
      let status = chunk.withUnsafeMutableBytes { buffer -> OSStatus in
        guard let base = buffer.baseAddress else { return -1 }
        return CMBlockBufferCopyDataBytes(
          block, atOffset: 0, dataLength: length, destination: base)
      }
      if status == kCMBlockBufferNoErr { pcm.append(chunk) }
    }
    if reader.status == .failed {
      throw VideoSpeechError(code: "ERR_TRANSCRIBE", message: "Cannot read this video's sound.")
    }
    if pcm.isEmpty {
      throw VideoSpeechError(code: "ERR_NO_AUDIO", message: "This video has no sound.")
    }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("speech-\(UUID().uuidString).wav")
    var file = wavHeader(dataLength: pcm.count, sampleRate: 16_000)
    file.append(pcm)
    try file.write(to: url)
    return url
  }

  static func wavHeader(dataLength: Int, sampleRate: Int) -> Data {
    var h = Data()
    func u32(_ v: Int) { withUnsafeBytes(of: UInt32(v).littleEndian) { h.append(contentsOf: $0) } }
    func u16(_ v: Int) { withUnsafeBytes(of: UInt16(v).littleEndian) { h.append(contentsOf: $0) } }
    h.append(contentsOf: Array("RIFF".utf8)); u32(36 + dataLength)
    h.append(contentsOf: Array("WAVE".utf8))
    h.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1)
    u32(sampleRate); u32(sampleRate * 2); u16(2); u16(16)
    h.append(contentsOf: Array("data".utf8)); u32(dataLength)
    return h
  }
}

/// One recognition at a time; keeps the recognizer and task alive until the final result.
enum Recognition {
  private static var recognizer: SFSpeechRecognizer?
  private static var task: SFSpeechRecognitionTask?

  static func run(
    wav: URL, language: String, completion: @escaping (Result<[String], VideoSpeechError>) -> Void
  ) {
    DispatchQueue.main.async {
      task?.cancel()
      guard let rec = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
        completion(.failure(VideoSpeechError(code: "ERR_LANGUAGE", message: language)))
        return
      }
      // Privacy: the audio must never leave the device.
      guard rec.supportsOnDeviceRecognition, rec.isAvailable else {
        completion(.failure(VideoSpeechError(code: "ERR_LANGUAGE", message: language)))
        return
      }
      let request = SFSpeechURLRecognitionRequest(url: wav)
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = false
      if #available(iOS 16, *) { request.addsPunctuation = true }
      recognizer = rec
      var done = false
      task = rec.recognitionTask(with: request) { result, error in
        if done { return }
        if let result, result.isFinal {
          done = true
          completion(.success(lines(of: result.bestTranscription)))
          recognizer = nil
          task = nil
          return
        }
        if let error {
          done = true
          let ns = error as NSError
          // 1110: no speech detected — an empty transcript, not a failure.
          if ns.domain == "kAFAssistantErrorDomain" && ns.code == 1110 {
            completion(.success([]))
          } else {
            completion(.failure(VideoSpeechError(code: "ERR_TRANSCRIBE", message: error.localizedDescription)))
          }
          recognizer = nil
          task = nil
        }
      }
    }
  }

  /// The transcript cut at pauses longer than 0.7 s: one line per spoken phrase.
  static func lines(of transcription: SFTranscription) -> [String] {
    var out: [String] = []
    var current: [String] = []
    var lastEnd: TimeInterval = 0
    for segment in transcription.segments {
      if !current.isEmpty && segment.timestamp - lastEnd > 0.7 {
        out.append(current.joined(separator: " "))
        current = []
      }
      current.append(segment.substring)
      lastEnd = segment.timestamp + segment.duration
    }
    if !current.isEmpty { out.append(current.joined(separator: " ")) }
    // Punctuation added by iOS 16+ is kept in the segments; fall back to the whole text.
    return out.isEmpty ? [transcription.formattedString].filter { !$0.isEmpty } : out
  }
}
