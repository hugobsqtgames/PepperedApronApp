import AppIntents
import SwiftUI
import WidgetKit

// Data written by the app (src/services/widgets.ts) into the shared App Group.
// The widget bundle id is "<app bundle id>.<target>"; the App Group is "group.<app bundle id>".
private func appGroup() -> String {
  var parts = (Bundle.main.bundleIdentifier ?? "app.pepperedapron.com").split(separator: ".").map(String.init)
  if parts.count > 1 { parts.removeLast() }
  return "group." + parts.joined(separator: ".")
}

private func dict(_ key: String) -> [String: Any] {
  UserDefaults(suiteName: appGroup())?.dictionary(forKey: key) ?? [:]
}

/// Items of the active shopping list ([{id, name}]), written by the app.
private func shoppingItems() -> [[String: Any]] {
  UserDefaults(suiteName: appGroup())?.array(forKey: "shoppingItems") as? [[String: Any]] ?? []
}

/// Ticking an item in the widget (iOS 17 interactive widget). The widget cannot write the app's
/// database: the tick is queued in the App Group ("pendingChecks") and applied by the app the
/// next time it is opened; the widget hides the item straight away.
struct ToggleShoppingItemIntent: AppIntent {
  static var title: LocalizedStringResource = "Check off a grocery item"
  static var isDiscoverable = false

  @Parameter(title: "Item") var itemId: String

  init() {}
  init(itemId: String) { self.itemId = itemId }

  func perform() async throws -> some IntentResult {
    guard let defaults = UserDefaults(suiteName: appGroup()) else { return .result() }
    var pending = (try? JSONSerialization.jsonObject(
      with: Data((defaults.string(forKey: "pendingChecks") ?? "[]").utf8))) as? [String] ?? []
    if !pending.contains(itemId) { pending.append(itemId) }
    if let data = try? JSONSerialization.data(withJSONObject: pending) {
      defaults.set(String(data: data, encoding: .utf8), forKey: "pendingChecks")
    }
    let items = shoppingItems().filter { ($0["id"] as? String) != itemId }
    defaults.set(items, forKey: "shoppingItems")
    var shopping = defaults.dictionary(forKey: "shopping") ?? [:]
    shopping["remaining"] = max(0, (shopping["remaining"] as? Int ?? 1) - 1)
    defaults.set(shopping, forKey: "shopping")
    return .result()
  }
}

struct PAEntry: TimelineEntry {
  let date: Date
  let labels: [String: Any]
  let tonight: [String: Any]
  let nextMeal: [String: Any]
  let shopping: [String: Any]
  let random: [String: Any]
  let items: [[String: Any]]
}

struct PAProvider: TimelineProvider {
  func placeholder(in context: Context) -> PAEntry {
    PAEntry(date: Date(), labels: ["tonight": "Ce soir"], tonight: ["title": "Carbonara"], nextMeal: [:], shopping: ["remaining": 6, "name": "Courses"], random: ["title": "Tarte aux pommes"], items: [["id": "1", "name": "Tomates"], ["id": "2", "name": "Basilic"]])
  }
  func getSnapshot(in context: Context, completion: @escaping (PAEntry) -> Void) {
    completion(load())
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<PAEntry>) -> Void) {
    // The app reloads widgets whenever data changes; also refresh hourly for date rollover.
    completion(Timeline(entries: [load()], policy: .after(Date().addingTimeInterval(3600))))
  }
  private func load() -> PAEntry {
    PAEntry(date: Date(), labels: dict("labels"), tonight: dict("tonight"), nextMeal: dict("nextMeal"), shopping: dict("shopping"), random: dict("random"), items: shoppingItems())
  }
}

private struct Header: View {
  let text: String
  var body: some View {
    HStack(spacing: 6) {
      Image("glyph").resizable().frame(width: 18, height: 18).clipShape(RoundedRectangle(cornerRadius: 4))
      Text(text.uppercased()).font(.caption2).fontWeight(.semibold).foregroundStyle(Color("paprika"))
    }
  }
}

struct TonightView: View {
  let entry: PAEntry
  @Environment(\.widgetFamily) var family
  var body: some View {
    let title = entry.tonight["title"] as? String ?? ""
    let label = entry.labels["tonight"] as? String ?? "Ce soir"
    let shown = title.isEmpty ? (entry.labels["nothing"] as? String ?? "—") : title
    switch family {
    case .accessoryInline:
      Text("\(label) : \(shown)")
        .widgetURL(URL(string: entry.tonight["url"] as? String ?? "pepperedapron://planning"))
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label(label, systemImage: "fork.knife").font(.caption).widgetAccentable()
        Text(shown).font(.headline).lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(URL(string: entry.tonight["url"] as? String ?? "pepperedapron://planning"))
    default:
      home(title: title)
    }
  }
  private func home(title: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Header(text: entry.labels["tonight"] as? String ?? "Ce soir")
      Spacer(minLength: 0)
      Text(title.isEmpty ? (entry.labels["nothing"] as? String ?? "—") : title)
        .font(.system(.headline, design: .serif)).foregroundStyle(Color("ink")).lineLimit(3)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: entry.tonight["url"] as? String ?? "pepperedapron://planning"))
  }
}

struct NextMealView: View {
  let entry: PAEntry
  var body: some View {
    let title = entry.nextMeal["title"] as? String ?? ""
    VStack(alignment: .leading, spacing: 4) {
      Header(text: entry.labels["nextMeal"] as? String ?? "Prochain repas")
      Spacer(minLength: 0)
      Text(entry.nextMeal["slot"] as? String ?? "").font(.caption).foregroundStyle(Color("muted"))
      Text(title.isEmpty ? (entry.labels["nothing"] as? String ?? "—") : title)
        .font(.system(.headline, design: .serif)).foregroundStyle(Color("ink")).lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: "pepperedapron://planning"))
  }
}

struct ShoppingView: View {
  let entry: PAEntry
  @Environment(\.widgetFamily) var family
  var body: some View {
    let remaining = entry.shopping["remaining"] as? Int ?? 0
    let label = entry.labels["shopping"] as? String ?? "Courses"
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: "cart").font(.caption)
          Text("\(remaining)").font(.headline)
        }
      }
      .widgetURL(URL(string: "pepperedapron://shopping"))
    case .accessoryInline:
      Label("\(label) : \(remaining)", systemImage: "cart")
        .widgetURL(URL(string: "pepperedapron://shopping"))
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Label("\(label) · \(remaining)", systemImage: "cart").font(.caption).widgetAccentable()
        Text(entry.items.prefix(2).compactMap { $0["name"] as? String }.joined(separator: ", "))
          .font(.footnote).lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(URL(string: "pepperedapron://shopping"))
    default:
      home(remaining: remaining, label: label)
    }
  }
  private func home(remaining: Int, label: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Header(text: label)
      HStack(alignment: .firstTextBaseline) {
        Text("\(remaining)").font(.system(size: 34, weight: .bold, design: .serif)).foregroundStyle(Color("forest"))
        Text(entry.shopping["name"] as? String ?? "").font(.caption).foregroundStyle(Color("muted")).lineLimit(1)
      }
      if family != .systemSmall {
        // Tap the circle to check the item off (applied in the app at its next opening).
        ForEach(Array(entry.items.prefix(family == .systemLarge ? 6 : 3).enumerated()), id: \.offset) { _, item in
          Button(intent: ToggleShoppingItemIntent(itemId: item["id"] as? String ?? "")) {
            Label(item["name"] as? String ?? "", systemImage: "circle")
              .font(.footnote).foregroundStyle(Color("ink")).lineLimit(1)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .buttonStyle(.plain)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "pepperedapron://shopping"))
  }
}

struct RandomView: View {
  let entry: PAEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Header(text: entry.labels["random"] as? String ?? "Au hasard")
      Spacer(minLength: 0)
      Text("🎲").font(.title)
      Text(entry.random["title"] as? String ?? "—").font(.system(.headline, design: .serif)).foregroundStyle(Color("ink")).lineLimit(3)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: entry.random["url"] as? String ?? "pepperedapron://"))
  }
}

private extension View {
  func paBackground() -> some View {
    containerBackground(for: .widget) { Color("background") }
  }
}

struct TonightWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PATonight", provider: PAProvider()) { TonightView(entry: $0).paBackground() }
      .configurationDisplayName("Ce soir").description("Le repas prévu ce soir.")
      .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
  }
}
struct NextMealWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PANextMeal", provider: PAProvider()) { NextMealView(entry: $0).paBackground() }
      .configurationDisplayName("Prochain repas").description("Votre prochain repas planifié.")
      .supportedFamilies([.systemSmall])
  }
}
struct ShoppingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PAShopping", provider: PAProvider()) { ShoppingView(entry: $0).paBackground() }
      .configurationDisplayName("Liste de courses").description("Ce qu'il reste à acheter.")
      .supportedFamilies([
        .systemSmall, .systemMedium, .systemLarge,
        .accessoryCircular, .accessoryRectangular, .accessoryInline,
      ])
  }
}
struct RandomWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PARandom", provider: PAProvider()) { RandomView(entry: $0).paBackground() }
      .configurationDisplayName("Recette au hasard").description("Une idée tirée de votre carnet.")
      .supportedFamilies([.systemSmall])
  }
}

@main
struct PepperedApronWidgets: WidgetBundle {
  var body: some Widget {
    TonightWidget()
    NextMealWidget()
    ShoppingWidget()
    RandomWidget()
  }
}
