#!/usr/bin/env bash
# Copia los 7 widgets oficiales TOROBYTE a android/. Solo para uso manual local.
# CI ya hace esto automáticamente vía .github/workflows/build-apk.yml.
set -e

PKG_DIR="android/app/src/main/kotlin/app/solarops/client"
RES="android/app/src/main/res"

mkdir -p "$PKG_DIR" "$RES/layout" "$RES/drawable" "$RES/xml" "$RES/values" "$RES/values-night"

cp -f android-widget/java/*.kt "$PKG_DIR/"
cp -rf android-widget/res/* "$RES/"

echo "✅ 7 widgets TOROBYTE copiados a android/"
echo "👉 Recuerda fusionar android-widget/AndroidManifest.snippet.xml en tu AndroidManifest.xml"
