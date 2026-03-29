<h1 align="center">
  <br>
  🔬 HexLab
  <br>
</h1>

<h4 align="center">
Advanced Android Reverse-Engineering Workbench right inside your <a href="https://code.visualstudio.com/">VS Code</a>.
</h4>

<p align="center">
  <em>Forked from <a href="https://github.com/APKLab/APKLab">APKLab</a> — extended with additional ADB tooling, configurable JVM heap sizing, root-bypass tooling, and more.</em>
</p>

<p align="center">
HexLab seamlessly integrates the best open-source tools: <a href="https://github.com/ibotpeaches/apktool/">Apktool</a>, <a href="https://github.com/skylot/jadx">Jadx</a>, <a href="https://github.com/patrickfav/uber-apk-signer">uber-apk-signer</a>, <a href="https://github.com/shroudedcode/apk-mitm/">apk-mitm</a> and more to the excellent VS Code so you can focus on app analysis and never leave your IDE.
</p>

---

## ✨ Features

- Decode all the resources from an APK
- Disassemble the APK to Dalvik bytecode aka Smali
- Decompile the APK to Java source via **Jadx**
- Interactive Malware Analysis Report (via Quark-Engine)
- Initialize project dir as a Git repo
- Excellent Smali language support with [**Smalise**](https://github.com/LoyieKing/Smalise)
- Apply MITM patch for HTTPS inspection
- Patch common string-based root / emulator checks and exact MyID SDK detections in smali
- Build (and rebuild) an APK from Smali and resources
- Rebuild an APK in Debug mode for dynamic analysis
- Sign the APK seamlessly during the build
- Install the APK directly from VS Code via ADB
- **ADB: Uninstall app** from connected device
- **ADB: Launch app** on connected device
- **ADB: Stream Logcat** filtered to your app
- Configurable **JVM Max Heap Size** for large APK decompilation
- Support for Apktool-style projects (`apktool.yml`)
- Support for most Apktool CLI arguments
- Support for user-provided keystore for APK signing
- Download and configure missing dependencies automatically
- Supports Linux, Windows, and macOS

---

## 📋 Requirements

- **JDK 11+**

  > Run **`java -version`** in your shell. If not found, download from [Adoptium](https://adoptium.net/).

- **ADB** (optional — for install / uninstall / launch / logcat)

  > Run **`adb devices`** in your shell. If not found, check [this guide](https://www.xda-developers.com/install-adb-windows-macos-linux/).

- **quark-engine ≥21.01.6** (optional — for malware analysis)

  > Run **`quark`** in your shell. If not found, check [official docs](https://github.com/quark-engine/quark-engine).

---

## 🚀 Getting Started

#### Open APK or Apktool project

- Open the Command Palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) ➜ <kbd>APKLab: Open an APK</kbd>
- Or simply open an existing Apktool project folder

#### Apply MITM patch

- Right-click on or inside `apktool.yml` ➜ <kbd>APKLab: Prepare for HTTPS inspection</kbd>

#### Apply root bypass patch

- Right-click on or inside `apktool.yml` ➜ <kbd>APKLab: Patch APK for Root Bypass</kbd>
- Exact MyID SDK methods are patched when `uz/myid/android/sdk/capture/core/MyIdStore` is present
- Common string-based detector constants such as `su`, `test-keys`, emulator markers, shell-channel labels, and selected SELinux checks are mutated in app-side smali with rebuild validation support

#### Rebuild and Sign APK

- Right-click on or inside `apktool.yml` ➜ <kbd>APKLab: Rebuild the APK</kbd>

#### Install APK to device

- Right-click on `.apk` file (in `dist/` directory) ➜ <kbd>APKLab: Install the APK</kbd>

#### ADB Utilities

- Command Palette ➜ <kbd>APKLab: ADB Uninstall App</kbd>
- Command Palette ➜ <kbd>APKLab: ADB Launch App</kbd>
- Command Palette ➜ <kbd>APKLab: ADB Stream Logcat</kbd>

#### Clean ApkTool frameworks dir

- Command Palette ➜ <kbd>APKLab: Empty ApkTool Framework Dir</kbd>

---

## ⚙️ Extension Settings

<details>
  <summary>Dependency Paths</summary>

- **`apklab.apktoolPath`**: Full path of `apktool.jar`. Override to use a specific version:

  `"apklab.apktoolPath": "/home/user/downloads/apktool_2.9.0.jar"`

- **`apklab.apkSignerPath`**: Full path of `uber-apk-signer.jar`.

  `"apklab.apkSignerPath": "/home/user/downloads/uber-apk-signer-1.3.0.jar"`

- **`apklab.jadxDirPath`**: Full path of `jadx-x.y.z` directory.

  `"apklab.jadxDirPath": "/home/user/downloads/jadx-1.4.7"`

  On Linux and macOS, HexLab will automatically repair execute permissions for the bundled Jadx launcher scripts and run them through `bash` when needed.

</details>

<details>
  <summary>Keystore Configuration</summary>

- **`apklab.keystorePath`**: Absolute path of your Java keystore (`.jks` / `.keystore`).
- **`apklab.keystorePassword`**: Password of your keystore.
- **`apklab.keyAlias`**: Alias of the used key in the keystore.
- **`apklab.keyPassword`**: Password of the used key.

</details>

<details>
  <summary>Advanced Configuration</summary>

- **`apklab.jvmHeapSize`**: JVM Max Heap Size for decompiling very large APKs (e.g. `-Xmx4g`). Leave blank for the JVM default.
- **`apklab.initProjectDirAsGit`**: Automatically initialize the project output directory as a Git repository.
- **`apklab.updateTools`**: Whether HexLab should check for tool updates on startup.
- **`apklab.rootBypassVerifyRebuild`**: Rebuild immediately after a root bypass patch to catch smali issues early.
- **`apklab.rootBypassScope`**: Root bypass scan scope. `app-only` focuses on the app package, `all` scans all smali classes.
- **`apklab.rootBypassAdditionalPackages`**: Extra Java package prefixes to include in root bypass analysis.

</details>

---

## 🐛 Known Issues

Please open an issue at our [GitHub repository](https://github.com/Mkadir/APKLab/issues).

---

## 🤝 Contributing

Bug reports, feature requests, and PRs are always welcome. Open an issue [here](https://github.com/Mkadir/APKLab/issues).

---

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## 🙏 Credits

HexLab is built on the shoulders of giants:

- **[APKLab](https://github.com/APKLab/APKLab)** by [Surendrajat](https://github.com/Surendrajat) — the upstream project this fork is based on
- [Feimaomii](https://github.com/Feimaomii) for the original logo
- [Niklas Higi](https://github.com/shroudedcode) for apk-mitm
- [Shaun Dang](https://github.com/pulorsok), [JunWei Song](https://github.com/krnick) & [KunYu Chen](https://github.com/18z) for Quark-Engine
- [iBotPeaches](https://github.com/iBotPeaches), [brutall](https://github.com/brutall) & [JesusFreke](https://github.com/JesusFreke) for Apktool & Smali
- [patrickfav](https://github.com/patrickfav) for uber-apk-signer
- [skylot](https://github.com/skylot) for Jadx
- [Loyie King](https://github.com/LoyieKing) for Smalise
