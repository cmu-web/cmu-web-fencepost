// Screenshots: sends the form to /api/screenshot and shows the image
(function () {
  "use strict";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var status = byId("fp-status"),
    imageUrl,
    imageUrls = [],
    files = {},
    size = "";
  // kind: notice while working, success when done, error
  function message(text, kind) {
    var error = kind === "error";
    status.className = "cmu-flash cmu-flash--" + (kind || "notice");
    status.setAttribute("role", error ? "alert" : "status");
    status.textContent = text;
    // The message sits above the form; bring it into view, as from a button
    // at the bottom of a long form on a phone
    status.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  // While FencePost works: the template's spinner where the screenshot goes,
  // and the words for screen readers only
  function working(text) {
    status.className = "sr-only";
    status.setAttribute("role", "status");
    status.textContent = text;
    byId("fp-figure").hidden = true;
    byId("fp-spinner").hidden = false;
  }
  function done() {
    byId("fp-spinner").hidden = true;
    byId("fp-figure").hidden = false;
  }
  // A site FencePost doesn't capture yet: a notice, not an error, with the
  // next step on its own line
  // A site's Cloudflare bot check: a notice, with how its team can let us in
  function botCheck() {
    message(
      "This site uses Cloudflare to block automated visitors. FencePost can't see the page.",
      "notice",
    );
    var how = document.createElement("a");
    how.className = "cta";
    how.href = "reference.html#cloudflare";
    how.textContent = "See How to Let FencePost In";
    status.append(document.createElement("br"), how);
  }
  function notCaptured() {
    message("This site isn't on FencePost's list yet.", "notice");
    var request = document.createElement("a");
    request.className = "cta";
    request.href = "reference.html#sites";
    request.textContent = "See How to Request a Site";
    status.append(document.createElement("br"), request);
  }
  // The chosen kind: a card in a plain frame, or a phone in the Web Kilt's
  // phone frame
  var SIZES = { card: [1040, 656], phone: [430, 790] };
  function kind() {
    return document.querySelector('input[name="fp-kind"]:checked').value;
  }
  function frame(k) {
    byId("fp-actions").style.maxWidth = "";
    byId("fp-figure").className = k === "phone" ? "cmu-shot cmu-shot--phone" : "cmu-shot";
    byId("fp-preview").width = SIZES[k][0];
    byId("fp-preview").height = SIZES[k][1];
  }
  // Until the first screenshot, an example of the chosen kind, matching the
  // field's example link; while taking one, a gray placeholder of its size
  var taken = false;
  function showPlaceholder() {
    var k = kind();
    frame(k);
    byId("fp-preview").src = taken
      ? "images/placeholder-" + k + ".svg"
      : "images/example-" + k + ".webp";
    byId("fp-preview").alt = taken
      ? ""
      : k === "phone"
        ? "An example screenshot: Forbes & Moreword's home page on a phone."
        : "An example screenshot: Forbes & Moreword's home page as a card.";
    byId("fp-actions").hidden = true;
  }
  // The chosen file type: the download and the hint (file name, size, bytes)
  function kb(bytes) {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }
  function showFormat() {
    var f = files[byId("fp-format").value];
    if (!f) return;
    var download = byId("fp-download");
    download.href = f.href;
    download.download = f.file;
    // The file name on its own line, then its size
    byId("fp-format-hint").replaceChildren(
      f.file,
      document.createElement("br"),
      size + ", " + kb(f.bytes),
    );
  }
  byId("fp-format").addEventListener("change", showFormat);
  // screenshots.html?url=...&kind=phone (or card) fills in the form
  var params = new URLSearchParams(location.search);
  if (params.get("url")) byId("fp-url").value = params.get("url");
  var asked = params.get("kind");
  if (asked === "phone" || asked === "card")
    document.querySelector('input[name="fp-kind"][value="' + asked + '"]').checked = true;
  showPlaceholder();
  document.querySelectorAll('input[name="fp-kind"]').forEach(function (radio) {
    radio.addEventListener("change", showPlaceholder);
  });
  byId("fp-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = event.submitter || byId("fp-form").querySelector('button[type="submit"]');
    button.disabled = true;
    taken = true;
    byId("fp-shot-label").textContent = "Screenshot";
    showPlaceholder();
    working("Taking your screenshot. Capturing a page can take up to half a minute.");
    try {
      var k = kind();
      var response = await fetch("api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: byId("fp-url").value.trim(), kind: k }),
      });
      var result = await response.json().catch(function () {
        return { error: "That screenshot didn't work. Try again." };
      });
      if (!response.ok) {
        var failure = new Error(result.error);
        failure.status = response.status;
        failure.code = result.code;
        throw failure;
      }
      // All three formats came back; the menu picks which one downloads
      imageUrls.forEach(function (u) {
        URL.revokeObjectURL(u);
      });
      imageUrls = [];
      files = {};
      result.images.forEach(function (f) {
        var bytes = Uint8Array.from(atob(f.image), function (c) {
          return c.charCodeAt(0);
        });
        var href = URL.createObjectURL(new Blob([bytes], { type: f.type }));
        imageUrls.push(href);
        files[f.format] = { href: href, file: f.file, bytes: f.bytes };
      });
      imageUrl = files.webp.href;
      size = result.width + " \u00d7 " + result.height + " pixels";
      var preview = byId("fp-preview");
      frame(k);
      preview.src = imageUrl;
      preview.alt = "A screenshot of " + result.title + (k === "phone" ? " on a phone." : ".");
      showFormat();
      byId("fp-actions").hidden = false;
      // Under a phone, the menu is as wide as the phone, with Download beside it
      var actions = byId("fp-actions");
      actions.style.maxWidth = "";
      if (kind() === "phone") {
        var row = byId("fp-download").parentElement;
        // The phone is hidden while the spinner shows, so use its frame's
        // width from the stylesheet rather than its measured one
        actions.style.maxWidth =
          "calc(" +
          getComputedStyle(byId("fp-figure")).maxWidth +
          " + " +
          (parseFloat(getComputedStyle(row).columnGap) || 0) +
          "px + " +
          byId("fp-download").offsetWidth +
          "px)";
      }
      message("Your screenshot is ready to download.", "success");
      // The address says what was taken, so the result can be sent as a link
      history.replaceState(
        null,
        "",
        "?" + new URLSearchParams({ url: byId("fp-url").value.trim(), kind: k }).toString(),
      );
    } catch (error) {
      showPlaceholder();
      if (error.status === 403) notCaptured();
      else if (error.code === "bot-check") botCheck();
      else message(error.message, "error");
    } finally {
      done();
      button.disabled = false;
    }
  });

  // screenshots.html?url=...&kind=... takes that screenshot, so a result can
  // be sent as a link
  if (params.get("url")) byId("fp-form").requestSubmit();
  // Pasting an address anywhere on the page (not into a field) fills in
  // Link
  document.addEventListener("paste", function (event) {
    var target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable]")) return;
    var text = (event.clipboardData && event.clipboardData.getData("text")) || "";
    text = text.trim();
    if (!/^[^\s]+\.[^\s]+$/.test(text) || text.length > 2048) return;
    event.preventDefault();
    var field = byId("fp-url");
    field.value = text;
    field.focus();
  });
})();
