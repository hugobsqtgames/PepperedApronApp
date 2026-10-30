import ExpoModulesCore
import PDFKit
import UIKit

/// Text of a PDF, read on the device with PDFKit. A scanned PDF has no text: its first pages are
/// rendered as pictures (caches folder) so the app can read them with text recognition.
public class PdfTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfText")

    AsyncFunction("read") { (pdfUri: URL, maxPages: Int, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let doc = PDFDocument(url: pdfUri) else {
          promise.reject("ERR_PDF", "Cannot open this PDF.")
          return
        }
        if doc.isLocked {
          promise.reject("ERR_LOCKED", "This PDF is protected by a password.")
          return
        }
        let limit = min(doc.pageCount, max(1, maxPages))
        var text: [String] = []
        for i in 0..<limit {
          if let s = doc.page(at: i)?.string { text.append(s) }
        }
        let joined = text.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        var pages: [String] = []
        if joined.count < 40 {
          let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pdf-pages/\(UUID().uuidString)", isDirectory: true)
          try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
          for i in 0..<limit {
            guard let page = doc.page(at: i) else { continue }
            let box = page.bounds(for: .mediaBox)
            let scale = 2000 / max(box.width, box.height)
            let image = page.thumbnail(
              of: CGSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
            let file = dir.appendingPathComponent("\(i).jpg")
            if let jpeg = image.jpegData(compressionQuality: 0.9), (try? jpeg.write(to: file)) != nil {
              pages.append(file.absoluteString)
            }
          }
        }
        promise.resolve(["text": joined, "pages": pages, "pageCount": doc.pageCount])
      }
    }
  }
}
