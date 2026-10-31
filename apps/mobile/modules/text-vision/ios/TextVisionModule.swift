import ExpoModulesCore
import ImageIO
import UIKit
import Vision

/// Text recognition on the device with Apple Vision: printed and handwritten text, in the
/// languages asked (French first), with the position of each line. Nothing leaves the phone.
public class TextVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TextVision")

    AsyncFunction("recognize") { (uri: URL, languages: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let source = CGImageSourceCreateWithURL(uri as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else {
          promise.reject("ERR_IMAGE", "Cannot read this picture.")
          return
        }
        // Photos from the camera are stored sideways with an orientation tag: Vision needs it.
        var orientation = CGImagePropertyOrientation.up
        if let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let raw = props[kCGImagePropertyOrientation] as? UInt32,
          let o = CGImagePropertyOrientation(rawValue: raw)
        {
          orientation = o
        }
        let request = VNRecognizeTextRequest()
        // The accurate level is the one that reads handwriting.
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let supported =
          (try? request.supportedRecognitionLanguages()) ?? ["en-US"]
        let wanted = languages.filter { supported.contains($0) }
        if !wanted.isEmpty { request.recognitionLanguages = wanted }
        if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = wanted.isEmpty }
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        do {
          try handler.perform([request])
        } catch {
          promise.reject("ERR_VISION", error.localizedDescription)
          return
        }
        let lines: [[String: Any]] = (request.results ?? []).compactMap { o in
          guard let best = o.topCandidates(1).first else { return nil }
          let box = o.boundingBox
          // Vision's origin is the bottom left; the app's is the top left.
          return [
            "text": best.string,
            "confidence": Double(best.confidence),
            "x": Double(box.minX),
            "y": Double(1 - box.maxY),
            "width": Double(box.width),
            "height": Double(box.height),
          ]
        }
        promise.resolve(lines)
      }
    }
  }
}
