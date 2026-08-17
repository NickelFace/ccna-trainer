# R8 rules for the release build (minifyEnabled + shrinkResources).
#
# Capacitor finds plugins by reflection: the bridge reads @CapacitorPlugin annotations and
# calls @PluginMethod methods by name from JavaScript. R8 has no way to see those call
# sites, so without these keeps the release build strips the plugins and every native call
# fails at runtime with "plugin not implemented" — while the debug build works fine.

-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# The plugins this app actually ships: App (back button), Preferences (persistence),
# AppLauncher (handing the AI prompt to another app).
-keep class com.capacitorjs.plugins.** { *; }

# Cordova compatibility layer that Capacitor pulls in even with no Cordova plugins.
-keep class org.apache.cordova.** { *; }

# JavaScript interfaces are called from the WebView by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the annotations themselves so the runtime lookups above still resolve.
-keepattributes *Annotation*, JavascriptInterface
