import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Apple's language model on the iPhone (Foundation Models, iOS 26+, with Apple Intelligence on):
/// given what a recipe video shows and says, it writes the recipe in a fixed shape (guided
/// generation: the answer always has these fields). Nothing leaves the phone. The app checks
/// every line of the answer against the video before using it.
public class RecipeModelModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecipeModel")

    /// "available", or "unavailable:<reason>" (old iOS, device not eligible, Apple Intelligence
    /// off, model still downloading).
    AsyncFunction("availability") { () -> String in
      #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
          switch SystemLanguageModel.default.availability {
          case .available:
            return "available"
          case .unavailable(let reason):
            return "unavailable:\(reason)"
          @unknown default:
            return "unavailable:unknown"
          }
        }
      #endif
      return "unavailable:os"
    }

    AsyncFunction("structure") { (instructions: String, prompt: String, promise: Promise) in
      #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
          Task {
            do {
              let session = LanguageModelSession(instructions: instructions)
              let response = try await session.respond(
                to: prompt,
                generating: VideoRecipe.self,
                options: GenerationOptions(temperature: 0.2)
              )
              promise.resolve(response.content.dictionary)
            } catch {
              promise.reject("ERR_MODEL", String(describing: error))
            }
          }
          return
        }
      #endif
      promise.reject("ERR_UNAVAILABLE", "No on-device language model on this iPhone.")
    }
  }
}

#if canImport(FoundationModels)
  @available(iOS 26.0, *)
  @Generable
  struct VideoIngredient {
    @Guide(description: "Name of the food as written or said, without the quantity, e.g. \"farine\", \"crème fraîche\".")
    var name: String
    @Guide(description: "Only a number written or said in the sources, e.g. \"200\", \"1/2\". Empty when none is given.")
    var quantity: String?
    @Guide(description: "Unit as written or said, e.g. \"g\", \"cl\", \"c. à soupe\". Empty when none.")
    var unit: String?
  }

  @available(iOS 26.0, *)
  @Generable
  struct VideoRecipe {
    @Guide(description: "Name of the dish, short, as named in the sources. Empty when none.")
    var title: String?
    @Guide(description: "Number of servings only if the sources give it.")
    var servings: Int?
    @Guide(description: "Every ingredient of the recipe, once each, in order of use.")
    var ingredients: [VideoIngredient]
    @Guide(description: "The method: one instruction per step, in order, in the sources' language. No comments, greetings or calls to subscribe.")
    var steps: [String]

    /// Only the fields given (a missing one is null on the JavaScript side).
    var dictionary: [String: Any] {
      var out: [String: Any] = [
        "ingredients": ingredients.map { i -> [String: Any] in
          var item: [String: Any] = ["name": i.name]
          if let q = i.quantity { item["quantity"] = q }
          if let u = i.unit { item["unit"] = u }
          return item
        },
        "steps": steps,
      ]
      if let title { out["title"] = title }
      if let servings { out["servings"] = servings }
      return out
    }
  }
#endif
