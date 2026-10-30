import AVFoundation
import ExpoModulesCore
import Speech

/// Cook mode voice commands: the microphone is listened to continuously and recognised by Apple
/// Speech with `requiresOnDeviceRecognition` (nothing leaves the phone). Each recognised phrase is
/// sent to JavaScript ("onSpeech"), which decides whether it is a command. A recognition task
/// lasts about a minute: it is restarted transparently, and after each phrase, so the text sent
/// is only what was just said. Only runs between start() and stop() (cook mode, when turned on).
public class VoiceCommandsModule: Module {
  private let engine = AVAudioEngine()
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var running = false
  private var restartWork: DispatchWorkItem?
  /// Increases with each recognition task: JavaScript acts once per phrase.
  private var phrase = 0

  public func definition() -> ModuleDefinition {
    Name("VoiceCommands")
    Events("onSpeech", "onError")

    AsyncFunction("start") { (language: String, promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
          promise.reject("ERR_PERMISSION", "Speech recognition is not allowed for this app.")
          return
        }
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
          guard granted else {
            promise.reject("ERR_PERMISSION", "The microphone is not allowed for this app.")
            return
          }
          DispatchQueue.main.async {
            guard let r = SFSpeechRecognizer(locale: Locale(identifier: language)),
              r.supportsOnDeviceRecognition
            else {
              promise.reject("ERR_LANGUAGE", "No on-device recognition for this language.")
              return
            }
            self.recognizer = r
            do {
              try self.startEngine()
              self.running = true
              self.startTask()
              promise.resolve(nil)
            } catch {
              self.stopAll()
              promise.reject("ERR_AUDIO", error.localizedDescription)
            }
          }
        }
      }
    }

    AsyncFunction("stop") {
      DispatchQueue.main.async { self.stopAll() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.stopAll() }
    }
  }

  private func startEngine() throws {
    let session = AVAudioSession.sharedInstance()
    // Spoken steps (read aloud) keep playing on the speaker while the microphone listens.
    try session.setCategory(
      .playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .duckOthers, .allowBluetooth])
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.request?.append(buffer)
    }
    engine.prepare()
    try engine.start()
  }

  private func startTask() {
    guard running, let recognizer else { return }
    task?.cancel()
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.requiresOnDeviceRecognition = true
    req.shouldReportPartialResults = true
    req.taskHint = .confirmation
    request = req
    phrase += 1
    let current = phrase
    task = recognizer.recognitionTask(with: req) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let text = result.bestTranscription.formattedString
        if !text.isEmpty {
          self.sendEvent("onSpeech", ["text": text, "final": result.isFinal, "phrase": current])
        }
        // A short command is complete after a brief pause: start afresh for the next one.
        self.scheduleRestart(after: result.isFinal ? 0 : 1.2)
      } else if error != nil {
        self.scheduleRestart(after: 0.3)
      }
    }
    // Recognition tasks are limited to about a minute.
    scheduleRestart(after: 50)
  }

  private func scheduleRestart(after seconds: Double) {
    restartWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.running else { return }
      self.request?.endAudio()
      self.startTask()
    }
    restartWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func stopAll() {
    running = false
    restartWork?.cancel()
    restartWork = nil
    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
