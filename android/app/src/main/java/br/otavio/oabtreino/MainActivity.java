package br.otavio.oabtreino;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** O app inteiro é a página web/index.html; esta Activity só a abre num WebView, sem internet. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle estadoSalvo) {
        super.onCreate(estadoSalvo);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true); // progresso fica no localStorage
        ajustes.setTextZoom(100);           // o A-/A+ do app é o único controle de tamanho da letra
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html#/");
    }

    @Override
    public void onBackPressed() {
        // com um diálogo aberto na página (confirmação ou aviso), o Voltar só fecha o diálogo
        web.evaluateJavascript("window.voltarAndroid ? window.voltarAndroid() : false", fechou -> {
            if ("true".equals(fechou)) return;
            String url = web.getUrl();
            if (url != null && url.endsWith("#/")) {
                finish(); // no início, um Voltar sempre fecha o app (mesmo se ele chegou ao início por um botão)
            } else if (web.canGoBack()) {
                web.goBack();
            } else {
                finish();
            }
        });
    }
}
