#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the Swift plugin with Capacitor's Objective-C runtime bridge.
// Without this file the plugin compiles but never appears on window.Capacitor.
CAP_PLUGIN(ThermoRivetStoreKitPlugin, "ThermoRivetStoreKit",
           CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(finish, CAPPluginReturnPromise);
)
