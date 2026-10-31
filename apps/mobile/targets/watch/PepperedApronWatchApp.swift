import SwiftUI
import WatchKit
import WatchConnectivity

/// What the phone sends (src/services/watch.ts): the shopping list and the running timers.
/// Kept on the watch so it shows something even before the phone is reachable.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = PhoneLink()

  struct Item: Identifiable, Hashable {
    let id: String
    let name: String
  }
  struct KitchenTimer: Identifiable, Hashable {
    let id: String
    let label: String
    let start: Date
    let end: Date
  }

  @Published var listName = ""
  @Published var items: [Item] = []
  @Published var timers: [KitchenTimer] = []
  @Published var labels: [String: String] = [:]

  /// Items checked here and not yet applied by the phone: hidden until the phone drops them.
  private var pending: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "pendingChecks") ?? [])

  override init() {
    super.init()
    apply(UserDefaults.standard.dictionary(forKey: "context") ?? [:], save: false)
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil {
      session.delegate = self
      session.activate()
    }
  }

  func check(_ item: Item) {
    pending.insert(item.id)
    UserDefaults.standard.set(Array(pending), forKey: "pendingChecks")
    items.removeAll { $0.id == item.id }
    // Queued by the system: delivered even if the phone is not reachable right now.
    WCSession.default.transferUserInfo(["check": item.id])
  }

  private func apply(_ context: [String: Any], save: Bool) {
    if save { UserDefaults.standard.set(context, forKey: "context") }
    listName = context["listName"] as? String ?? ""
    let all = (context["items"] as? [[String: Any]] ?? []).compactMap { d -> Item? in
      guard let id = d["id"] as? String, let name = d["name"] as? String else { return nil }
      return Item(id: id, name: name)
    }
    // Once the phone no longer lists an item, its tick has been applied.
    pending = pending.intersection(Set(all.map { $0.id }))
    UserDefaults.standard.set(Array(pending), forKey: "pendingChecks")
    items = all.filter { !pending.contains($0.id) }
    timers = (context["timers"] as? [[String: Any]] ?? []).compactMap { d -> KitchenTimer? in
      guard let id = d["id"] as? String, let end = d["end"] as? Double else { return nil }
      let start = min(d["start"] as? Double ?? end, end)
      return KitchenTimer(
        id: id, label: d["label"] as? String ?? "",
        start: Date(timeIntervalSince1970: start), end: Date(timeIntervalSince1970: end))
    }
    labels = context["labels"] as? [String: String] ?? labels
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    let context = session.receivedApplicationContext
    guard !context.isEmpty else { return }
    DispatchQueue.main.async { self.apply(context, save: true) }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async { self.apply(applicationContext, save: true) }
  }
}

@main
struct PepperedApronWatchApp: App {
  @StateObject private var link = PhoneLink.shared

  init() {
    PhoneLink.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      TabView {
        ShoppingPage()
        TimersPage()
      }
      .tabViewStyle(.verticalPage)
      .environmentObject(link)
    }
  }
}

struct ShoppingPage: View {
  @EnvironmentObject var link: PhoneLink

  var body: some View {
    NavigationStack {
      List {
        if link.items.isEmpty {
          Text(link.labels["empty"] ?? "—").foregroundStyle(.secondary)
        }
        ForEach(link.items) { item in
          Button {
            WKInterfaceDevice.current().play(.click)
            link.check(item)
          } label: {
            Label(item.name, systemImage: "circle")
          }
        }
      }
      .navigationTitle(link.listName.isEmpty ? (link.labels["shopping"] ?? "Courses") : link.listName)
    }
  }
}

struct TimersPage: View {
  @EnvironmentObject var link: PhoneLink

  var body: some View {
    NavigationStack {
      List {
        let running = link.timers.filter { $0.end > Date() }
        if running.isEmpty {
          Text(link.labels["noTimer"] ?? "—").foregroundStyle(.secondary)
        }
        ForEach(running) { timer in
          HStack(spacing: 10) {
            ProgressView(timerInterval: timer.start...timer.end, countsDown: true) {
              EmptyView()
            } currentValueLabel: {
              EmptyView()
            }
            .progressViewStyle(.circular)
            .tint(Color("paprika"))
            .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
              Text(timer.label).font(.footnote).lineLimit(2)
              Text(timerInterval: timer.start...timer.end, countsDown: true)
                .font(.system(.title3, design: .rounded)).monospacedDigit()
            }
          }
        }
      }
      .navigationTitle(link.labels["timers"] ?? "Minuteurs")
    }
  }
}
