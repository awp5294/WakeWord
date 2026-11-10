import ExpoModulesCore

/// What the app target provides. AlarmKit's App Intents have to live in the app target
/// (the system reads their metadata from the app bundle), so the real work is done by
/// `WakeWordBackend` in ios/WakeWord/WakeWordBackend.swift, which the config plugin adds there.
/// This module finds it at runtime by its Objective-C name.
@objc public protocol WakeAlarmBackend: NSObjectProtocol {
  init()
  func isSupported() -> Bool
  func status() -> String
  func requestPermission(_ done: @escaping (String) -> Void)
  func scheduleDaily(_ hour: Int, minute: Int, title: String, done: @escaping (String?) -> Void)
  func scheduleTest(_ seconds: Int, title: String, done: @escaping (String?) -> Void)
  func cancelAll(_ done: @escaping (String?) -> Void)
  func owedRing() -> Double
  func missionStarted()
  func missionHeartbeat()
  func missionComplete()
}

struct AlarmError: Exception {
  let message: String
  var reason: String { message }
}

public class WakeAlarmModule: Module {
  private lazy var backend: WakeAlarmBackend? = {
    guard let cls = NSClassFromString("WakeWordBackend") as? WakeAlarmBackend.Type else { return nil }
    return cls.init()
  }()

  public func definition() -> ModuleDefinition {
    Name("WakeAlarm")

    Function("isSupported") { () -> Bool in
      self.backend?.isSupported() ?? false
    }

    // "granted" | "denied" | "notDetermined" | "unavailable"
    Function("getPermission") { () -> String in
      self.backend?.status() ?? "unavailable"
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      guard let b = self.backend else { return promise.resolve("unavailable") }
      b.requestPermission { promise.resolve($0) }
    }

    AsyncFunction("scheduleDaily") { (hour: Int, minute: Int, title: String, promise: Promise) in
      guard let b = self.backend else { return promise.reject(AlarmError(message: "Alarms aren't available on this device")) }
      b.scheduleDaily(hour, minute: minute, title: title) { err in
        if let err { promise.reject(AlarmError(message: err)) } else { promise.resolve(nil) }
      }
    }

    AsyncFunction("scheduleTest") { (seconds: Int, title: String, promise: Promise) in
      guard let b = self.backend else { return promise.reject(AlarmError(message: "Alarms aren't available on this device")) }
      b.scheduleTest(seconds, title: title) { err in
        if let err { promise.reject(AlarmError(message: err)) } else { promise.resolve(nil) }
      }
    }

    AsyncFunction("cancelAll") { (promise: Promise) in
      guard let b = self.backend else { return promise.resolve(nil) }
      b.cancelAll { err in
        if let err { promise.reject(AlarmError(message: err)) } else { promise.resolve(nil) }
      }
    }

    // Epoch ms of the ring that still needs a finished mission, or 0.
    // Custom alarm sounds are Android-only for now; iPhone uses the AlarmKit sound.
    Function("setSound") { (_: String) in }

    Function("getOwedRing") { () -> Double in
      self.backend?.owedRing() ?? 0
    }

    Function("missionStarted") { self.backend?.missionStarted() }
    Function("missionHeartbeat") { self.backend?.missionHeartbeat() }
    Function("missionComplete") { self.backend?.missionComplete() }

    Function("openSettings") {
      DispatchQueue.main.async {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
      }
    }
  }
}
