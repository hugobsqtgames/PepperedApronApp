import AppIntents
import Foundation

// Siri / Shortcuts, answered offline from the snapshot the app writes into the App Group
// (src/services/widgets.ts). Nothing leaves the device. The extension's bundle id is
// "<app bundle id>.PepperedApronIntents"; the App Group is "group.<app bundle id>".
private func appGroup() -> String {
  var parts = (Bundle.main.bundleIdentifier ?? "app.pepperedapron.com").split(separator: ".").map(String.init)
  if parts.count > 1 { parts.removeLast() }
  return "group." + parts.joined(separator: ".")
}

private var defaults: UserDefaults? { UserDefaults(suiteName: appGroup()) }
/// The app writes objects as JSON data (@bacons/apple-targets ExtensionStorage), not as
/// property lists: read both.
private func dict(_ key: String) -> [String: Any] {
  if let data = defaults?.data(forKey: key),
    let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  {
    return object
  }
  return defaults?.dictionary(forKey: key) ?? [:]
}
private func label(_ key: String, _ fallback: String) -> String {
  (dict("intentLabels")[key] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? fallback
}

struct TonightIntent: AppIntent {
  static var title: LocalizedStringResource = "What's for dinner tonight?"
  static var description = IntentDescription("Tells the meal planned tonight in PepperedApron.")

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let title = dict("tonight")["title"] as? String ?? ""
    if title.isEmpty {
      return .result(dialog: IntentDialog(stringLiteral: label("nothingTonight", "Nothing is planned tonight.")))
    }
    let text = label("tonight", "Tonight: %@").replacingOccurrences(of: "%@", with: title)
    return .result(dialog: IntentDialog(stringLiteral: text))
  }
}

struct AddToShoppingIntent: AppIntent {
  static var title: LocalizedStringResource = "Add to my groceries"
  static var description = IntentDescription(
    "Adds an item to the active shopping list. It appears in the list the next time the app opens.")

  @Parameter(title: "Item", requestValueDialog: "What should I add?") var item: String

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let text = item.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, let defaults else {
      return .result(dialog: IntentDialog(stringLiteral: label("addFailed", "Nothing was added.")))
    }
    // The app's database is not reachable from here: the request is queued in the App Group
    // and applied by the app the next time it is opened (or comes back to the foreground).
    var pending = (try? JSONSerialization.jsonObject(
      with: Data((defaults.string(forKey: "pendingAdds") ?? "[]").utf8))) as? [String] ?? []
    pending.append(String(text.prefix(200)))
    if let data = try? JSONSerialization.data(withJSONObject: Array(pending.suffix(50))) {
      defaults.set(String(data: data, encoding: .utf8), forKey: "pendingAdds")
    }
    let reply = label("added", "Added to your groceries: %@").replacingOccurrences(of: "%@", with: text)
    return .result(dialog: IntentDialog(stringLiteral: reply))
  }
}

struct RandomRecipeIntent: AppIntent {
  static var title: LocalizedStringResource = "A random recipe"
  static var description = IntentDescription("Suggests a recipe from your PepperedApron cookbook.")

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let title = dict("random")["title"] as? String ?? ""
    if title.isEmpty {
      return .result(dialog: IntentDialog(stringLiteral: label("noRecipe", "Your cookbook is empty.")))
    }
    let text = label("random", "Why not %@?").replacingOccurrences(of: "%@", with: title)
    return .result(dialog: IntentDialog(stringLiteral: text))
  }
}

struct PepperedApronShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TonightIntent(),
      phrases: [
        "What's for dinner in \(.applicationName)",
        "Qu'est-ce qu'on mange ce soir dans \(.applicationName)",
        "Ce soir dans \(.applicationName)",
      ],
      shortTitle: "Tonight",
      systemImageName: "fork.knife")
    AppShortcut(
      intent: AddToShoppingIntent(),
      phrases: [
        "Add to my groceries in \(.applicationName)",
        "Ajoute aux courses dans \(.applicationName)",
      ],
      shortTitle: "Add to groceries",
      systemImageName: "cart.badge.plus")
    AppShortcut(
      intent: RandomRecipeIntent(),
      phrases: [
        "A random recipe in \(.applicationName)",
        "Une recette au hasard dans \(.applicationName)",
      ],
      shortTitle: "Random recipe",
      systemImageName: "dice")
  }
}

@main
struct PepperedApronIntentsExtension: AppIntentsExtension {}
