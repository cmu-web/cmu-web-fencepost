// Check: sends the address to /api/check and shows the preview and findings
(function () {
  "use strict";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var status = byId("fc-status");
  // kind: error, notice (things to fix) or success
  function message(text, kind) {
    status.className = "cmu-flash cmu-flash--" + (kind || "notice");
    status.setAttribute("role", kind === "error" ? "alert" : "status");
    status.textContent = text;
  }
  function fill(id, box, findings) {
    var list = byId(id);
    list.replaceChildren.apply(
      list,
      findings.map(function (f) {
        var li = document.createElement("li");
        li.textContent = f.text;
        // The section of the Web Kilt's standard that covers it
        if (f.standard) {
          var a = document.createElement("a");
          a.className = "external";
          a.href = f.standard.url;
          a.textContent = f.standard.title;
          li.append(document.createElement("br"), "See ", a, ".");
        }
        return li;
      }),
    );
    byId(box).hidden = !findings.length;
  }
  byId("fc-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = event.submitter,
      url = byId("fc-url").value.trim();
    button.disabled = true;
    byId("fc-results").hidden = true;
    message("Checking the link.");
    try {
      var response = await fetch("api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url }),
      });
      var r = await response.json().catch(function () {
        return { error: "That check didn't work. Try again." };
      });
      if (!response.ok) throw new Error(r.error);
      byId("fc-host").textContent = r.host;
      byId("fc-title").textContent = r.title || "No title";
      byId("fc-description").textContent = r.description;
      var image = byId("fc-image");
      image.hidden = !(r.image && !r.image.error);
      if (!image.hidden) {
        image.src = r.image.url;
        image.alt = r.imageAlt;
      }
      var by = function (s) {
        return r.findings.filter(function (f) {
          return f.status === s;
        });
      };
      var fixes = by("fix");
      fill("fc-fixes", "fc-fix-box", fixes);
      fill("fc-notes", "fc-notes-box", by("note"));
      fill("fc-passes", "fc-pass-box", by("pass"));
      // A missing or wrong image is what Make fixes
      var imageFix = fixes.some(function (f) {
        return /^(image|alt)/.test(f.key);
      });
      byId("fc-make").hidden = !imageFix;
      byId("fc-make-link").href = "make.html?url=" + encodeURIComponent(r.url);
      byId("fc-results").hidden = false;
      if (fixes.length)
        message(fixes.length + (fixes.length === 1 ? " thing" : " things") + " to fix.");
      else message("This link's preview follows the standard.", "success");
    } catch (error) {
      message(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
})();
