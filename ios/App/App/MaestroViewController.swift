// SPM 환경에서 앱 타깃 로컬 플러그인을 등록하는 표준 경로 (스펙 2026-08-05 §1).
import Capacitor
import UIKit

class MaestroViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MaestroZeroConfPlugin())
        print("⚡️ Maestro: 로컬 ZeroConf 플러그인 등록 완료 (SPM 우회)")
    }
}
