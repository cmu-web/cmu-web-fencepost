// Make: sends the form to /api/preview and shows the image and tags
(function () {
  "use strict";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var status = byId("fp-status"),
    form = byId("fp-form"),
    imageUrl;
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
  // While FencePost works: the template's spinner where the preview goes,
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
  // The file as base64, without its data: prefix
  function base64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(",")[1]);
      };
      reader.onerror = function () {
        reject(new Error("The screenshot couldn't be read. Choose it again."));
      };
      reader.readAsDataURL(file);
    });
  }
  // Until there's a preview, an example: a capture of Forbes & Moreword's News page,
  // to match the fields' example text, and the card's text from what's typed
  // so far or that example text
  var EXAMPLE_IMAGE = "images/example-generate.jpg";
  var generated = false;
  function cardText() {
    if (generated) return;
    // The top line is the site's name, as Slack, Teams and Discord show it
    ["site", "title", "description"].forEach(function (name) {
      var field = byId("fp-" + name);
      byId("fp-card-" + name).textContent = field.value.trim() || field.placeholder;
    });
  }
  ["fp-site", "fp-title", "fp-description"].forEach(function (id) {
    byId(id).addEventListener("input", cardText);
  });
  function showPlaceholder() {
    generated = false;
    byId("fp-result-title").textContent = "Example Preview";
    byId("fp-preview").src = EXAMPLE_IMAGE;
    byId("fp-preview").alt = "An example preview: Forbes & Moreword's News page.";
    cardText();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = undefined;
    byId("fp-download").removeAttribute("href");
  }
  // Check supplies the details it found; all remain editable before generation
  var params = new URLSearchParams(location.search);
  ["url", "title", "description", "site"].forEach(function (name) {
    var value = params.get(name),
      field = byId("fp-" + name);
    if (value) field.value = value.slice(0, field.maxLength);
  });
  cardText();
  function screenshotChanged() {
    var uploaded = byId("fp-source").value === "upload" && Boolean(byId("fp-file").files.length);
    byId("fp-title").required = uploaded;
    byId("fp-description").required = uploaded;
    byId("fp-clear-file").hidden = !uploaded;
  }
  byId("fp-file").addEventListener("change", screenshotChanged);
  byId("fp-source").addEventListener("change", screenshotChanged);
  byId("fp-clear-file").addEventListener("click", function () {
    byId("fp-file").value = "";
    screenshotChanged();
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    byId("fp-actions").hidden = true;
    showPlaceholder();
    working("Making your preview. It can take up to half a minute.");
    try {
      var payload = {
        url: byId("fp-url").value.trim(),
        title: byId("fp-title").value.trim(),
        description: byId("fp-description").value.trim(),
        site: byId("fp-site").value.trim(),
        imagePath: byId("fp-path").value.trim(),
      };
      // Only a capture waits
      if (byId("fp-source").value === "capture") payload.delay = Number(byId("fp-delay").value);
      if (!payload.site) throw new Error("Enter the site's name.");
      var source = byId("fp-source").value,
        file = source === "upload" && byId("fp-file").files[0];
      if (source === "upload" && !file) throw new Error("Choose an image to upload.");
      if (source === "link") {
        payload.imageUrl = byId("fp-image-url").value.trim();
        if (!payload.imageUrl) throw new Error("Enter the image's link.");
      }
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image under 8 MB.");
        if (!payload.title || !payload.description)
          throw new Error("Enter a title and description for your image.");
        payload.screenshot = await base64(file);
      }
      var response = await fetch("api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var result = await response.json().catch(function () {
        return { error: "That preview didn't work. Try again." };
      });
      if (!response.ok) {
        var failure = new Error(result.error);
        failure.status = response.status;
        failure.code = result.code;
        throw failure;
      }
      var bytes = Uint8Array.from(atob(result.image), function (c) {
        return c.charCodeAt(0);
      });
      imageUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      byId("fp-preview").src = imageUrl;
      byId("fp-preview").alt = "Preview image for " + result.title + ".";
      generated = true;
      byId("fp-result-title").textContent = "Preview";
      byId("fp-card-site").textContent = payload.site;
      byId("fp-card-title").textContent = result.title;
      byId("fp-card-description").textContent = result.description;
      byId("fp-download").href = imageUrl;
      // An image link: either it's ready as it is (nothing to save), or a
      // fixed copy, with why
      var linked = result.linked === true,
        fixes = result.imageFixes || [];
      byId("fp-linked").hidden = !linked;
      byId("fp-save").hidden = linked;
      byId("fp-image-fixes").hidden = !fixes.length;
      byId("fp-image-fix-list").replaceChildren.apply(
        byId("fp-image-fix-list"),
        fixes.map(function (fix) {
          var item = document.createElement("li");
          item.textContent = fix;
          return item;
        }),
      );
      // A linked image that meets the standard has nothing to place, so the
      // image location stays hidden; a fixed copy does, so it appears
      if (fixes.length) byId("fp-path-box").hidden = false;
      byId("fp-tags").textContent = result.tags;
      byId("fp-save-path").textContent = payload.imagePath;
      var checkedUrl = /^https?:\/\//i.test(payload.url) ? payload.url : "https://" + payload.url;
      byId("fp-check-link").href = "check.html?url=" + encodeURIComponent(checkedUrl);
      byId("fp-actions").hidden = false;
      message(
        linked
          ? "Your preview is ready. Copy the tags."
          : "Your preview is ready. Save the image with your site, then copy the tags.",
        "success",
      );
      byId("fp-result-title").focus();
    } catch (error) {
      showPlaceholder();
      if (error.status === 403 && !error.code) notCaptured();
      else if (error.code === "bot-check") botCheck();
      else message(error.message, "error");
    } finally {
      done();
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });

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
