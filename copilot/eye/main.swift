// eye —— 抓取一个窗口（iPad 镜像 / 游戏窗口）并用 Apple Vision 做中文 OCR，按行输出 JSON。
// 只读屏幕像素：不读内存、不抓包、不模拟点击。
//
//   eye list                                   列出可抓取的窗口
//   eye watch --match 影片录制 [--fps 2] [--save DIR] [--words FILE]
//   eye ocr [--words FILE] a.png b.png ...     对图片做 OCR（测试/校准用）
//
// 坐标统一为 0–1、左上角为原点：{t 文本, c 置信度, x, y, w, h}

import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers
import Vision

struct Item: Codable { let t: String; let c: Float; let x: Double; let y: Double; let w: Double; let h: Double }
struct Frame: Codable { let ts: Double; let src: String; let w: Int; let h: Int; let ms: Int; let items: [Item]; let file: String? }
struct Status: Codable { let status: String; let detail: String }

func emit<T: Encodable>(_ v: T) {
    guard let data = try? JSONEncoder().encode(v) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func recognize(_ img: CGImage, words: [String]) throws -> [Item] {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.usesLanguageCorrection = true
    req.minimumTextHeight = 0.008
    if !words.isEmpty { req.customWords = words }
    try VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
    return (req.results ?? []).compactMap { o in
        guard let cand = o.topCandidates(1).first else { return nil }
        let b = o.boundingBox
        return Item(t: cand.string, c: cand.confidence, x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height)
    }
}

func loadImage(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func savePNG(_ img: CGImage, _ path: String) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
}

func arg(_ name: String, _ args: [String]) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

func loadWords(_ args: [String]) -> [String] {
    guard let p = arg("--words", args), let s = try? String(contentsOfFile: p, encoding: .utf8) else { return [] }
    return s.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
}

func findWindow(_ match: String) async throws -> SCWindow? {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    let m = match.lowercased()
    return content.windows.filter { w in
        let app = w.owningApplication?.applicationName.lowercased() ?? ""
        let title = w.title?.lowercased() ?? ""
        return (app.contains(m) || title.contains(m)) && w.frame.width > 300 && w.frame.height > 200
    }.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
}

func capture(_ w: SCWindow) async throws -> CGImage {
    let filter = SCContentFilter(desktopIndependentWindow: w)
    let cfg = SCStreamConfiguration()
    let scale = Double(filter.pointPixelScale)
    cfg.width = Int(w.frame.width * scale)
    cfg.height = Int(w.frame.height * scale)
    cfg.showsCursor = false
    return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
}

@main
struct Eye {
    static func main() async {
        let args = CommandLine.arguments
        let mode = args.count > 1 ? args[1] : "help"
        let words = loadWords(args)
        switch mode {
        case "list":
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                for w in content.windows where w.frame.width > 300 && w.frame.height > 200 {
                    print("\(w.windowID)\t\(w.owningApplication?.applicationName ?? "?")\t\(w.title ?? "")\t\(Int(w.frame.width))×\(Int(w.frame.height))")
                }
            } catch {
                emit(Status(status: "permission", detail: "需要「屏幕录制」权限：系统设置 → 隐私与安全性 → 屏幕与系统录音，勾选你的终端。(\(error.localizedDescription))"))
                exit(2)
            }
        case "ocr":
            let files = args.dropFirst(2).filter { !$0.hasPrefix("--") && !$0.hasSuffix(".txt") }
            for f in files {
                guard let img = loadImage(f) else { emit(Status(status: "error", detail: "读不了图片 \(f)")); continue }
                let t0 = Date()
                let items = (try? recognize(img, words: words)) ?? []
                emit(Frame(ts: Date().timeIntervalSince1970, src: f, w: img.width, h: img.height, ms: Int(Date().timeIntervalSince(t0) * 1000), items: items, file: f))
            }
        case "watch":
            let match = arg("--match", args) ?? "影片录制"
            let fps = Double(arg("--fps", args) ?? "2") ?? 2
            let saveDir = arg("--save", args)
            if let d = saveDir { try? FileManager.default.createDirectory(atPath: d, withIntermediateDirectories: true) }
            var lastSig = ""
            var lastEmit = Date.distantPast
            var lastMissing = Date.distantPast
            var n = 0
            while true {
                let tick = Date()
                do {
                    if let w = try await findWindow(match) {
                        let img = try await capture(w)
                        let items = try recognize(img, words: words)
                        let sig = items.map { $0.t }.joined(separator: "|")
                        if sig != lastSig || Date().timeIntervalSince(lastEmit) > 5 {
                            var file: String? = nil
                            if let d = saveDir, sig != lastSig {
                                n += 1
                                file = "\(d)/\(Int(Date().timeIntervalSince1970 * 1000)).png"
                                savePNG(img, file!)
                            }
                            emit(Frame(ts: Date().timeIntervalSince1970, src: (w.owningApplication?.applicationName ?? "") + " " + (w.title ?? ""), w: img.width, h: img.height, ms: Int(Date().timeIntervalSince(tick) * 1000), items: items, file: file))
                            lastSig = sig
                            lastEmit = Date()
                        }
                    } else if Date().timeIntervalSince(lastMissing) > 3 {
                        emit(Status(status: "no-window", detail: "没找到包含「\(match)」的窗口。先打开 QuickTime 影片录制（选 iPad）或 AirPlay 镜像，再用 eye list 看窗口名。"))
                        lastMissing = Date()
                    }
                } catch {
                    emit(Status(status: "permission", detail: "抓屏失败：\(error.localizedDescription)。需要给终端「屏幕录制」权限。"))
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                }
                let wait = max(0.05, 1 / fps - Date().timeIntervalSince(tick))
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            }
        default:
            print("eye list | eye watch --match <窗口名> [--fps 2] [--save DIR] [--words FILE] | eye ocr [--words FILE] <png...>")
        }
    }
}
