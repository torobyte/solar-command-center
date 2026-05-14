#!/usr/bin/env bash
# Copia los archivos del widget Android a su sitio dentro de android/
# Uso (Mac/Linux):  bash install-widget.sh
# Uso (Windows):    usa Git Bash y ejecuta:  bash install-widget.sh
set -e

PKG_DIR="android/app/src/main/java/app/solarops/client"
RES="android/app/src/main/res"

mkdir -p "$PKG_DIR" "$RES/layout" "$RES/drawable" "$RES/xml" "$RES/values"

cp android-widget/java/SolarOpsWidget.kt        "$PKG_DIR/"
cp android-widget/java/WidgetConfigActivity.kt  "$PKG_DIR/"
cp android-widget/res/layout/widget_solarops.xml      "$RES/layout/"
cp android-widget/res/drawable/widget_background.xml  "$RES/drawable/"
cp android-widget/res/xml/widget_solarops_info.xml    "$RES/xml/"
cp android-widget/res/values/strings_widget.xml       "$RES/values/"

echo ""
echo "✅ Archivos copiados."
echo ""
echo "👉 AHORA, paso manual:"
echo "   Abre el archivo:  android/app/src/main/AndroidManifest.xml"
echo "   Pega el contenido de:  android-widget/AndroidManifest.snippet.xml"
echo "   DENTRO de la etiqueta <application> ... </application>"
