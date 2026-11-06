import ExpoModulesCore
import Foundation
import UIKit

/// The bridge between `src/platform/composer` and the engine in Core/.
public class ImmersiaComposerModule: Module {
  private let jobs = Jobs()

  public func definition() -> ModuleDefinition {
    Name("ImmersiaComposer")

    Events("onProgress")

    AsyncFunction("compose") { (record: ComposeRequestRecord) async throws -> [String: Any] in
      let composer = Composer()
      let jobId = record.jobId
      self.jobs.set(jobId, composer)
      defer { self.jobs.remove(jobId) }

      // A video in progress keeps going for the short time iOS allows after the app leaves the screen. If it
      // is suspended anyway, the take stays "creating" and the queue starts it again on the next launch.
      let background = await BackgroundTask.begin()
      defer { BackgroundTask.end(background) }

      let throttle = ProgressThrottle()
      let result = try await composer.compose(record.request) { [weak self] fraction in
        guard throttle.shouldSend(fraction) else { return }
        self?.sendEvent("onProgress", ["jobId": jobId, "fraction": fraction])
      }
      return ["durationS": result.duration, "bytes": Double(result.bytes)]
    }

    Function("cancel") { (jobId: String) in
      self.jobs.get(jobId)?.cancel()
    }

    /// "nominal" | "fair" | "serious" | "critical": the capture screen warns from "serious" up.
    Function("thermalState") { () -> String in
      switch ProcessInfo.processInfo.thermalState {
      case .nominal: return "nominal"
      case .fair: return "fair"
      case .serious: return "serious"
      case .critical: return "critical"
      @unknown default: return "nominal"
      }
    }
  }
}

struct SegmentRecord: Record {
  @Field var srcStartS: Double = 0
  @Field var srcEndS: Double = 0
  @Field var stretch: Double = 1
}

struct ComposeRequestRecord: Record {
  @Field var jobId: String = ""
  @Field var inputPath: String = ""
  @Field var outputPath: String = ""
  @Field var segments: [SegmentRecord] = []
  @Field var reverse: Bool = false
  @Field var outputFps: Int = 30
  @Field var width: Int = 1080
  @Field var height: Int = 1920
  @Field var bitrate: Int = 12_000_000
  @Field var overlayPath: String? = nil
  @Field var audioPath: String? = nil
  @Field var audioStartS: Double = 0
  @Field var audioFadeOutS: Double = 1
  @Field var mirror: Bool = false

  var request: ComposeRequest {
    ComposeRequest(
      input: URL(fileURLWithPath: inputPath),
      output: URL(fileURLWithPath: outputPath),
      segments: segments.map { ComposeSegment(srcStart: $0.srcStartS, srcEnd: $0.srcEndS, stretch: $0.stretch) },
      reverse: reverse,
      outputFps: Int32(outputFps),
      width: width,
      height: height,
      bitrate: bitrate,
      overlay: overlayPath.map { URL(fileURLWithPath: $0) },
      audio: audioPath.map { URL(fileURLWithPath: $0) },
      audioStart: audioStartS,
      audioFadeOut: audioFadeOutS,
      mirror: mirror
    )
  }
}

/// Running composers by job id, so `cancel` can reach one from another thread.
private final class Jobs: @unchecked Sendable {
  private let lock = NSLock()
  private var byId: [String: Composer] = [:]

  func set(_ id: String, _ composer: Composer) {
    lock.lock()
    byId[id] = composer
    lock.unlock()
  }

  func get(_ id: String) -> Composer? {
    lock.lock()
    defer { lock.unlock() }
    return byId[id]
  }

  func remove(_ id: String) {
    lock.lock()
    byId[id] = nil
    lock.unlock()
  }
}

/// Sends progress at whole percents only: a 1,200-frame video would otherwise cross the bridge 1,200 times.
private final class ProgressThrottle: @unchecked Sendable {
  private let lock = NSLock()
  private var lastPercent = -1

  func shouldSend(_ fraction: Double) -> Bool {
    let percent = Int(fraction * 100)
    lock.lock()
    defer { lock.unlock() }
    guard percent != lastPercent else { return false }
    lastPercent = percent
    return true
  }
}

/// Holds the background task id where the expiration handler can reach it.
private final class BackgroundTaskBox: @unchecked Sendable {
  var id: UIBackgroundTaskIdentifier = .invalid
}

private enum BackgroundTask {
  static func begin() async -> BackgroundTaskBox {
    await MainActor.run {
      let box = BackgroundTaskBox()
      box.id = UIApplication.shared.beginBackgroundTask(withName: "Immersia video") {
        UIApplication.shared.endBackgroundTask(box.id)
        box.id = .invalid
      }
      return box
    }
  }

  static func end(_ box: BackgroundTaskBox) {
    DispatchQueue.main.async {
      guard box.id != .invalid else { return }
      UIApplication.shared.endBackgroundTask(box.id)
      box.id = .invalid
    }
  }
}
