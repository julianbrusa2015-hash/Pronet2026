package com.pronet.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Con targetSdk 36 el edge-to-edge es obligatorio en Android 15+: la WebView
 * ocupa la ventana entera, por debajo de la barra de estado y de la barra de
 * gestos. Alguien tiene que compensar eso, y hasta acá no lo hacía nadie:
 *
 *   - Esta clase estaba vacía.
 *   - activity_main.xml es un WebView a match_parent sin fitsSystemWindows.
 *   - Capacitor 8.5.0 no aplica insets (no hay una sola mención a
 *     WindowCompat, setDecorFitsSystemWindows ni WindowInsets en su Bridge).
 *   - El respaldo en JS de app.js estaba gateado con `navigator.standalone`,
 *     una propiedad EXCLUSIVA de Safari iOS: en Android nunca corría.
 *
 * O sea que el layout dependía al 100% de que la WebView resolviera
 * env(safe-area-inset-*), sin nada detrás si devolvía 0.
 *
 * Acá se publican los insets REALES como variables CSS. El CSS ya las combina
 * con max(), así que si env() además funciona el valor no se duplica —
 * max() elige, no suma.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Que el sistema no recorte la decoración: el layout web decide dónde
        // va el aire, que es lo que le permite pintar el color de la cabecera
        // por debajo de la barra de estado en vez de dejar una franja muerta.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        final WebView web = getBridge().getWebView();
        if (web == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(web, (v, windowInsets) -> {
            Insets barras = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());

            // Los insets vienen en píxeles físicos y CSS trabaja en dp.
            float densidad = getResources().getDisplayMetrics().density;
            final int top = Math.round(barras.top / densidad);
            final int bottom = Math.round(barras.bottom / densidad);

            final String js =
                    "document.documentElement.style.setProperty('--safe-top-fallback','" + top + "px');"
                  + "document.documentElement.style.setProperty('--safe-bottom-fallback','" + bottom + "px');";

            // post() y no ejecución directa: este callback puede llegar antes
            // de que la WebView tenga documento, y evaluateJavascript sobre una
            // página que todavía no cargó se pierde sin avisar.
            v.post(() -> web.evaluateJavascript(js, null));

            // Se devuelven los insets sin consumir: si algún día algo más
            // necesita reaccionar a ellos, los sigue recibiendo.
            return windowInsets;
        });
    }
}
