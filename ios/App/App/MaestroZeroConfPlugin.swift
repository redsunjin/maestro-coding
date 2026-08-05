// 앱 타깃 로컬 ZeroConf 플러그인 (스펙 2026-08-05 §1).
// capacitor-zeroconf 4.0.0이 SPM을 지원하지 않아 네이티브가 미탑재되는 문제를,
// 같은 jsName("ZeroConf")·같은 payload 형태의 로컬 구현으로 채운다 — JS 무변경.
// 패널이 쓰는 범위(watch/unwatch, resolved 액션의 name/port/ipv4Addresses)만 구현 (YAGNI).
import Capacitor
import Foundation

@objc(MaestroZeroConfPlugin)
public class MaestroZeroConfPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MaestroZeroConfPlugin"
    public let jsName = "ZeroConf"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "watch", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "unwatch", returnType: CAPPluginReturnPromise),
    ]

    private var watchers: [String: ServiceWatcher] = [:]

    private static func watcherKey(type: String, domain: String) -> String {
        return "\(type)|\(domain)"
    }

    @objc func watch(_ call: CAPPluginCall) {
        guard let type = call.getString("type"), !type.isEmpty else {
            call.reject("type이 필요합니다")
            return
        }
        let domain = call.getString("domain") ?? "local."

        call.keepAlive = true
        let key = Self.watcherKey(type: type, domain: domain)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.watchers[key]?.stop()
            let watcher = ServiceWatcher(type: type, domain: domain) { [weak self] action, payload in
                guard let self = self, let savedCall = self.bridge?.savedCall(withID: call.callbackId) else { return }
                var result = JSObject()
                result["action"] = action
                result["service"] = payload
                savedCall.resolve(result)
            }
            self.watchers[key] = watcher
            watcher.start()
        }
    }

    @objc func unwatch(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? ""
        let domain = call.getString("domain") ?? "local."
        let key = Self.watcherKey(type: type, domain: domain)

        DispatchQueue.main.async { [weak self] in
            self?.watchers[key]?.stop()
            self?.watchers.removeValue(forKey: key)
            call.resolve()
        }
    }
}

// NetServiceBrowser 기반 감시자 — 참조 플러그인(capacitor-zeroconf iOS)과 같은
// 해석 경로를 쓴다. (NetService는 deprecated지만 시뮬레이터·실기기 모두 동작하며
// 주소+포트 해석이 한 번에 온다.)
private final class ServiceWatcher: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private let type: String
    private let domain: String
    private let onEvent: (String, JSObject) -> Void
    private let browser = NetServiceBrowser()
    private var pendingServices: [NetService] = []

    init(type: String, domain: String, onEvent: @escaping (String, JSObject) -> Void) {
        self.type = type
        self.domain = domain
        self.onEvent = onEvent
        super.init()
        browser.delegate = self
    }

    func start() {
        browser.searchForServices(ofType: type, inDomain: domain)
    }

    func stop() {
        browser.stop()
        for service in pendingServices {
            service.stop()
            service.delegate = nil
        }
        pendingServices.removeAll()
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        onEvent("added", Self.jsonify(service))
        service.delegate = self
        pendingServices.append(service)
        service.resolve(withTimeout: 5)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        onEvent("removed", Self.jsonify(service))
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        onEvent("resolved", Self.jsonify(sender))
    }

    static func jsonify(_ service: NetService) -> JSObject {
        var ipv4Addresses: [String] = []
        var ipv6Addresses: [String] = []

        for addressData in service.addresses ?? [] {
            addressData.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
                guard let base = raw.baseAddress else { return }
                let family = base.assumingMemoryBound(to: sockaddr.self).pointee.sa_family
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(
                    base.assumingMemoryBound(to: sockaddr.self),
                    socklen_t(addressData.count),
                    &host,
                    socklen_t(host.count),
                    nil,
                    0,
                    NI_NUMERICHOST
                ) == 0 {
                    let address = String(cString: host)
                    if family == sa_family_t(AF_INET) {
                        ipv4Addresses.append(address)
                    } else if family == sa_family_t(AF_INET6) {
                        ipv6Addresses.append(address)
                    }
                }
            }
        }

        var payload = JSObject()
        payload["domain"] = service.domain
        payload["type"] = service.type
        payload["name"] = service.name
        payload["port"] = service.port
        payload["hostname"] = service.hostName ?? ""
        payload["ipv4Addresses"] = ipv4Addresses
        payload["ipv6Addresses"] = ipv6Addresses
        payload["txtRecord"] = JSObject()
        return payload
    }
}
