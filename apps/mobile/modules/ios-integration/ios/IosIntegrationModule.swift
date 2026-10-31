import CoreSpotlight
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers
import WatchConnectivity

/// Recipes in Spotlight (indexed on the device only, never sent to Apple's servers:
/// `isEligibleForSearch` stays on-device for CSSearchableItem) and Handoff of the recipe or the
/// cook mode being shown, to continue on the user's other iPhone or iPad.
/// "<bundle id>." — activity types are declared per variant in NSUserActivityTypes (app.config.ts).
private func activityPrefix() -> String { "\(Bundle.main.bundleIdentifier ?? "app.pepperedapron.com")." }

/// The Apple Watch app (targets/watch): the phone sends it the shopping list and the running
/// timers; an item checked on the watch comes back here. Like a tick in the widget, it is
/// queued in the App Group ("pendingChecks") and applied by the app (src/services/widgets.ts).
final class WatchLink: NSObject, WCSessionDelegate {
  static let shared = WatchLink()
  /// Called when the watch asked for something (the app applies it if it is running).
  var onRequest: (() -> Void)?
  private var lastContext: [String: Any]?

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil {
      session.delegate = self
      session.activate()
    }
  }

  func send(_ context: [String: Any]) {
    lastContext = context
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
    try? session.updateApplicationContext(context)
  }

  private func appGroup() -> String { "group.\(Bundle.main.bundleIdentifier ?? "app.pepperedapron.com")" }

  private func queueCheck(_ id: String) {
    guard let defaults = UserDefaults(suiteName: appGroup()) else { return }
    var pending = (try? JSONSerialization.jsonObject(
      with: Data((defaults.string(forKey: "pendingChecks") ?? "[]").utf8))) as? [String] ?? []
    if !pending.contains(id) { pending.append(id) }
    if let data = try? JSONSerialization.data(withJSONObject: pending) {
      defaults.set(String(data: data, encoding: .utf8), forKey: "pendingChecks")
    }
    DispatchQueue.main.async { self.onRequest?() }
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated, let context = lastContext { send(context) }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    if let id = userInfo["check"] as? String { queueCheck(id) }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    if let id = message["check"] as? String { queueCheck(id) }
  }
}

public class IosIntegrationModule: Module {
  private var activity: NSUserActivity?

  public func definition() -> ModuleDefinition {
    Name("IosIntegration")

    Events("onWatchRequest")

    OnCreate {
      WatchLink.shared.onRequest = { [weak self] in self?.sendEvent("onWatchRequest", [:]) }
      WatchLink.shared.activate()
    }

    // The Apple Watch app's data: { listName, items: [{id, name}], timers: [{label, start, end}], labels }.
    Function("sendToWatch") { (context: [String: Any]) in
      WatchLink.shared.send(context)
    }

    // Replace the whole index: recipes = [{ id, title, details, keywords, image? }].
    AsyncFunction("indexRecipes") { (recipes: [[String: Any]], promise: Promise) in
      let index = CSSearchableIndex.default()
      index.deleteSearchableItems(withDomainIdentifiers: ["recipes"]) { _ in
        let items = recipes.compactMap { r -> CSSearchableItem? in
          guard let id = r["id"] as? String, let title = r["title"] as? String else { return nil }
          let attrs = CSSearchableItemAttributeSet(contentType: UTType.content)
          attrs.title = title
          attrs.contentDescription = r["details"] as? String
          attrs.keywords = r["keywords"] as? [String]
          if let image = r["image"] as? String, let url = URL(string: image) {
            attrs.thumbnailURL = url
          }
          attrs.contentURL = URL(string: "pepperedapron://recipe/\(id)")
          return CSSearchableItem(uniqueIdentifier: id, domainIdentifier: "recipes", attributeSet: attrs)
        }
        guard !items.isEmpty else {
          promise.resolve(0)
          return
        }
        index.indexSearchableItems(items) { error in
          if let error { promise.reject("ERR_SPOTLIGHT", error.localizedDescription) } else {
            promise.resolve(items.count)
          }
        }
      }
    }

    AsyncFunction("clearIndex") { (promise: Promise) in
      CSSearchableIndex.default().deleteAllSearchableItems { _ in promise.resolve(nil) }
    }

    // Handoff: what is on screen now (type = "recipe" or "cook").
    Function("setActivity") { (type: String, title: String, url: String) in
      DispatchQueue.main.async {
        let a = NSUserActivity(activityType: "\(activityPrefix())\(type)")
        a.title = title
        a.userInfo = ["url": url]
        a.isEligibleForHandoff = true
        a.isEligibleForSearch = false
        a.isEligibleForPublicIndexing = false
        self.activity?.invalidate()
        self.activity = a
        a.becomeCurrent()
      }
    }

    Function("clearActivity") {
      DispatchQueue.main.async {
        self.activity?.invalidate()
        self.activity = nil
      }
    }
  }
}

/// A Spotlight result or a Handoff from another device opens the app here: it is turned into the
/// app's own link (pepperedapron://recipe/<id>), which the router then shows.
public class IosIntegrationAppDelegate: ExpoAppDelegateSubscriber {
  // Ready for the watch from launch: an item checked while the app was closed still arrives.
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    WatchLink.shared.activate()
    return true
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    var link: String?
    if userActivity.activityType == CSSearchableItemActionType,
      let id = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String
    {
      link = "pepperedapron://recipe/\(id)"
    } else if userActivity.activityType.hasPrefix(activityPrefix()) {
      link = userActivity.userInfo?["url"] as? String
    }
    guard let link, let url = URL(string: link), url.scheme == "pepperedapron" else { return false }
    DispatchQueue.main.async { UIApplication.shared.open(url) }
    return true
  }
}
