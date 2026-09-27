import SwiftUI
import WidgetKit

// Data written by the app (src/services/widgets.ts) into the shared App Group.
// The widget bundle id is "<app bundle id>.<target>"; the App Group is "group.<app bundle id>".
private func appGroup() -> String {
  var parts = (Bundle.main.bundleIdentifier ?? "app.pepperedapron").split(separator: ".").map(String.init)
  if parts.count > 1 { parts.removeLast() }
  return "group." + parts.joined(separator: ".")
}

private func dict(_ key: String) -> [String: Any] {
  UserDefaults(suiteName: appGroup())?.dictionary(forKey: key) ?? [:]
}

struct PAEntry: TimelineEntry {
  let date: Date
  let labels: [String: Any]
  let tonight: [String: Any]
  let nextMeal: [String: Any]
  let shopping: [String: Any]
  let random: [String: Any]
}

struct PAProvider: TimelineProvider {
  func placeholder(in context: Context) -> PAEntry {
    PAEntry(date: Date(), labels: ["tonight": "Ce soir"], tonight: ["title": "Carbonara"], nextMeal: [:], shopping: ["remaining": 6, "name": "Courses"], random: ["title": "Tarte aux pommes"])
  }
  func getSnapshot(in context: Context, completion: @escaping (PAEntry) -> Void) {
    completion(load())
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<PAEntry>) -> Void) {
    // The app reloads widgets whenever data changes; also refresh hourly for date rollover.
    completion(Timeline(entries: [load()], policy: .after(Date().addingTimeInterval(3600))))
  }
  private func load() -> PAEntry {
    PAEntry(date: Date(), labels: dict("labels"), tonight: dict("tonight"), nextMeal: dict("nextMeal"), shopping: dict("shopping"), random: dict("random"))
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
  var body: some View {
    let title = entry.tonight["title"] as? String ?? ""
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
    let items = (entry.shopping["items"] as? String ?? "").split(separator: "\n").map(String.init)
    VStack(alignment: .leading, spacing: 4) {
      Header(text: entry.labels["shopping"] as? String ?? "Courses")
      HStack(alignment: .firstTextBaseline) {
        Text("\(remaining)").font(.system(size: 34, weight: .bold, design: .serif)).foregroundStyle(Color("forest"))
        Text(entry.shopping["name"] as? String ?? "").font(.caption).foregroundStyle(Color("muted")).lineLimit(1)
      }
      if family != .systemSmall {
        ForEach(items.prefix(family == .systemLarge ? 6 : 3), id: \.self) { item in
          Label(item, systemImage: "circle").font(.footnote).foregroundStyle(Color("ink")).lineLimit(1)
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
      .supportedFamilies([.systemSmall, .systemMedium])
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
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
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
