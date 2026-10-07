import AVFoundation
import ExpoModulesCore

/// «المجالس» on iOS: background playback/capture comes from UIBackgroundModes=audio plus
/// Agora's active audio session. This module only watches audio interruptions (calls,
/// Siri, alarms) and re-activates the session when they end so JS can resume the engine.
public class CouncilAudioModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CouncilAudio")

    Events("onLeave", "onInterruption")

    Function("sync") { (councilId: String, title: String, text: String, onStage: Bool, url: String) -> Bool in
      self.observeInterruptions()
      return true
    }

    Function("stop") { () -> Bool in
      self.stopObserving()
      return true
    }

    Function("isMicCaptureAllowed") { () -> Bool in
      // UIBackgroundModes=audio keeps an active playAndRecord session capturing.
      return true
    }

    OnDestroy {
      self.stopObserving()
    }
  }

  private func observeInterruptions() {
    if observer != nil { return }
    observer = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] note in
      self?.handleInterruption(note)
    }
  }

  private func stopObserving() {
    if let observer = observer {
      NotificationCenter.default.removeObserver(observer)
    }
    observer = nil
  }

  private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    switch type {
    case .began:
      sendEvent("onInterruption", ["phase": "began"])
    case .ended:
      try? AVAudioSession.sharedInstance().setActive(true)
      sendEvent("onInterruption", ["phase": "ended"])
    @unknown default:
      break
    }
  }
}
