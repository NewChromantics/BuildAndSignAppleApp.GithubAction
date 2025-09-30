Build & Sign Apple App
====================
This action is an amalgamation of a few old actions which did below. (All WIP)

- [Build scheme/archive](https://github.com/NewChromantics/PopAction_BuildApple)
  - Override `CURRENT_PROJECT_VERSION` (build number) for Continious Deployment runs
- Installed signing certificates to runner
- Set entitlements (macos)
- Inserted provision files for macos & ios
- Re-signed internal frameworks (macos)
- Modified info.plist for testflight (eg. encryption excemptions)
- Setup sandboxing (macos)
- Resign app (post internal resigning)
- Packaged into installer (then signed with installer provision) for macos; making it MacAppStore compatible
- Upload to testflight


Params & Secrets Required
===================
- `TeamIdentifier=AA1A111A1` to find installed certificate
`SigningCertificate_P12_Base64` env or input should be a base64 encoded version of your `~Apple ~Distribution` signing certificate exported to `.p12`
	- Get this from [https://developer.apple.com](https://developer.apple.com) under `Certificates`, find the one for `Distribution`
	- Download the `distribution.cer` certificate and install to keychain access and should appear as `Apple Distribution: Company (TeamIdentifier)`
	- Export this to `.p12` (Must be in your `login`/personal keychain to export) with a password.
	- `base64 -i ./AppleDistribution.p12 > AppleDistribution.p12.base64.txt`
	- Copy this base64 data into a secret and pass into action
	- or testing locally
	- `export SigningCertificate_P12_Base64=$(base64 -i ./AppleDistribution.p12)`
- `SigningCertificate_Password` env or input which is the password to the above `.p12` exported certificate

Optional - Testflight
--------------------
- `ProvisioningProfile_Base64` env or input should be a base64 encoded version of your `embedded.provisionprofile` that will be inserted into your .app to allow testflight to be used(provisioned)
	- Get your `.provisionprofile` from [https://developer.apple.com](https://developer.apple.com) under `Profiles`, then find the provisioning profile for the `Mac App Store`. Then download.
	- `base64 -i ./embedded.provisionprofile > embedded.provisionprofile.base64.txt`
	- Copy this base64 data into a secret and pass into action
	- or testing locally
	- `export ProvisioningProfile_Base64=$(base64 -i ./embedded.provisionprofile)`
- `AppStoreConnect_Auth_Key` An Auth Key from app store connect, like `1234A5B6CD`
- `AppStoreConnect_Auth_Issuer` Issuer from appstore connect (same page!) - a long hex guid `aaaaaaaa-bbbb-aaaa-dddd-12345678901`
- `AppStoreConnect_Auth_P8_Base64` `.p8` file from AppStoreConnect encoded to base64
	- `base64 -i ./AuthKey.p8 > AuthKey.p8.base64.txt`
	- Copy this base64 data into a secret and pass into action
	- or testing locally
	- `export AppStoreConnect_Auth_P8_Base64=$(base64 -i ./AuthKey.p8)`

Optional - macos appstore/Testflight
-----------------------
- `InstallerCertificate_P12_Base64` env or input should be a base64 encoded `Mac Installer Distribution Certificate`
	- Get your `mac_installer.cer` from [https://developer.apple.com](https://developer.apple.com) under `Certificates`, find the one for `ac Installer Distribution Certificate`
	- Install to keychain (must be under a local keychain) and should appear as `3rd party mac developer installer`
	- Export to `mac_installer.p12` with password
	- `base64 -i ./mac_installer.p12 > mac_installer.p12.base64.txt`
	- `export InstallerCertificate_P12_Base64=$(base64 -i ./mac_installer.p12)`
