import CoreSpotlight
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

/// Recipes in Spotlight (indexed on the device only, never sent to Apple's servers:
/// `isEligibleForSearch` stays on-device for CSSearchableItem) and Handoff of the recipe or the
/// cook mode being shown, to continue on the user's other iPhone or iPad.
public class IosIntegrationModule: Module {
  private var activity: NSUserActivity?

  public func definition() -> ModuleDefinition {
    Name("IosIntegration")

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
        let a = NSUserActivity(activityType: "app.pepperedapron.\(type)")
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
    } else if userActivity.activityType.hasPrefix("app.pepperedapron.") {
      link = userActivity.userInfo?["url"] as? String
    }
    guard let link, let url = URL(string: link), url.scheme == "pepperedapron" else { return false }
    DispatchQueue.main.async { UIApplication.shared.open(url) }
    return true
  }
}
