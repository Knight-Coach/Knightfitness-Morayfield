/*
 * Knight Fitness site tracking: GA4 + Meta Pixel, and one lead event per enquiry.
 *
 * Load in <head> on every page:
 *   <script src="./assets/kf-tracking.js?v=1"></script>
 * The ?v= query must match ASSET_VERSION. /assets is cached for a year with
 * Cache-Control: immutable, so a changed file at the same URL stays stale.
 * Bump both together when this script changes.
 *
 * Call window.kfTrackLead({ site, source }) once an enquiry is confirmed sent.
 * GA4 gets `generate_lead`; Meta gets the standard `Lead` event.
 * A reload or back/forward of that confirmation page does not send it again.
 * Leave an ID empty ('') to switch that platform off.
 */
(function () {
  var ASSET_VERSION = '1';
  var GA4_ID = 'G-LPDJZ1128B';
  var META_PIXEL_ID = '408666429737807'; // Mark Knight's Pixel — confirmed by the owner

  if (window.__kfTracking) return;
  window.__kfTracking = { version: ASSET_VERSION };

  function sendMetaPageView() {
    try {
      if (META_PIXEL_ID && window.fbq) window.fbq('track', 'PageView');
    } catch (e) {}
  }

  if (GA4_ID) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // config sends the initial page_view. Route changes are not sent again here:
    // a manual page_view would double-count when the stream's enhanced
    // measurement is already listening for history changes.
    window.gtag('config', GA4_ID);
  }

  if (META_PIXEL_ID) {
    /* Meta Pixel base code */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // index.html is one document for every route. Meta does not see pushState,
  // so send another PageView when the path changes. GA4 is left to its config
  // call (and enhanced measurement, when that is on).
  var lastUrl = location.pathname + location.search + location.hash;
  function onRouteChange() {
    var next = location.pathname + location.search + location.hash;
    if (next === lastUrl) return;
    lastUrl = next;
    sendMetaPageView();
  }
  if (history.pushState) {
    var pushState = history.pushState;
    history.pushState = function () {
      var result = pushState.apply(this, arguments);
      try { onRouteChange(); } catch (e) {}
      return result;
    };
  }
  window.addEventListener('popstate', function () {
    try { onRouteChange(); } catch (e) {}
  });

  var firedLead = Object.create(null);

  function repeatView() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      // No Navigation Timing entry: fall back to sessionStorage, which still
      // collapses a reload and may also collapse a second enquiry this session.
      if (!nav || !nav.type) return true;
      return nav.type === 'reload' || nav.type === 'back_forward';
    } catch (e) {
      return true;
    }
  }

  window.kfTrackLead = function (meta) {
    meta = meta || {};
    var params = { site: meta.site || '', lead_source: meta.source || '', page_path: location.pathname };
    var key = params.site + '|' + params.lead_source + '|' + params.page_path;
    if (firedLead[key]) return;
    var storageKey = 'kf_lead:' + key;
    try {
      if (repeatView() && sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch (e) { /* private mode: still fire once for this document */ }
    firedLead[key] = true;
    try { if (GA4_ID && window.gtag) window.gtag('event', 'generate_lead', params); } catch (e) {}
    try {
      if (META_PIXEL_ID && window.fbq) {
        var opts = meta.eventId ? { eventID: meta.eventId } : undefined;
        window.fbq('track', 'Lead', { content_name: params.lead_source || params.site }, opts);
      }
    } catch (e) {}
  };
})();
