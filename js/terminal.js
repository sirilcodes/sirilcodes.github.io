(function () {
  var SITE = window.__SITE__ || {};
  var outputEl = document.getElementById('term-output');
  var inputEl = document.getElementById('term-input');
  var formEl = document.getElementById('term-form');
  if (!outputEl || !inputEl || !formEl) return;

  var posts = null;
  var postsPromise = null;
  function loadPosts() {
    if (posts) return Promise.resolve(posts);
    if (!postsPromise) {
      postsPromise = fetch(SITE.postsIndexURL)
        .then(function (r) {
          if (!r.ok) throw new Error('index unavailable');
          return r.json();
        })
        .then(function (data) {
          posts = data;
          return posts;
        });
    }
    return postsPromise;
  }

  function findPost(slugArg) {
    var needle = (slugArg || '').replace(/^posts\//i, '').replace(/\/$/, '').toLowerCase();
    return (posts || []).find(function (p) { return p.slug.toLowerCase() === needle; }) || null;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function reveal() {
    outputEl.hidden = false;
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function printCommandLine(text) {
    var line = el('div', 'term-line');
    var prompt = el('span', 'accent', '$');
    line.appendChild(prompt);
    line.appendChild(document.createTextNode(' ' + text));
    outputEl.appendChild(line);
  }

  function printText(text, cls) {
    var line = el('div', 'term-out' + (cls ? ' ' + cls : ''));
    line.textContent = text;
    outputEl.appendChild(line);
  }

  function printHTML(html, cls) {
    outputEl.appendChild(el('div', 'term-out' + (cls ? ' ' + cls : ''), html));
  }

  var COMMANDS = {
    help: function () {
      printText(
        [
          'available commands:',
          '  ls              list posts',
          '  cat <slug>      print a post inline',
          '  cd <slug|~>     open a post ( ~ or .. = home )',
          '  about           open the about page',
          '  rss             curl the rss feed',
          '  whoami          print the author',
          '  clear           clear this terminal',
          '  echo <text>     print text back'
        ].join('\n')
      );
    },
    whoami: function () {
      printText(SITE.author || 'guest');
    },
    clear: function () {
      outputEl.innerHTML = '';
      outputEl.hidden = true;
    },
    echo: function (args) {
      printText(args.join(' '));
    },
    about: function () {
      window.location.href = SITE.aboutURL;
    },
    rss: function () {
      printText('curl ' + SITE.rssURL);
      fetch(SITE.rssURL)
        .then(function (r) { return r.text(); })
        .then(function (text) {
          var snippet = text.trim().split('\n').slice(0, 8).join('\n');
          printHTML('<pre>' + escapeHTML(snippet) + '\n...</pre>');
          reveal();
        })
        .catch(function () {
          printText('curl: could not fetch rss.xml', 'term-err');
          reveal();
        });
    },
    ls: function () {
      loadPosts()
        .then(function (list) {
          if (!list.length) {
            printText('no posts yet.');
            reveal();
            return;
          }
          var rows = list
            .map(function (p) {
              var tags = (p.tags || []).map(function (t) { return '[' + t + ']'; }).join(' ');
              return (
                '<a class="term-post-row" href="' + p.permalink + '">' +
                '<span class="post-date">' + p.date + '</span>' +
                '<span class="post-title">' + escapeHTML(p.title) + '</span>' +
                '<span class="post-tags">' + tags + '</span>' +
                '</a>'
              );
            })
            .join('');
          printHTML('<div class="term-postlist">' + rows + '</div>');
          reveal();
        })
        .catch(function () {
          printText('ls: could not read posts/', 'term-err');
          reveal();
        });
    },
    cat: function (args) {
      if (!args.length) {
        printText('cat: missing file operand', 'term-err');
        reveal();
        return;
      }
      loadPosts()
        .then(function () {
          var post = findPost(args[0]);
          if (!post) {
            printText('cat: ' + args[0] + ': no such post', 'term-err');
            reveal();
            return;
          }
          printHTML('<div class="term-prose prose"><h3>' + escapeHTML(post.title) + '</h3>' + post.content + '</div>');
          reveal();
        })
        .catch(function () {
          printText('cat: could not read posts/', 'term-err');
          reveal();
        });
    },
    cd: function (args) {
      var target = (args[0] || '~').toLowerCase();
      if (target === '~' || target === '..' || target === '') {
        window.location.href = SITE.homeURL;
        return;
      }
      if (target === 'about') {
        window.location.href = SITE.aboutURL;
        return;
      }
      loadPosts().then(function () {
        var post = findPost(target);
        if (post) {
          window.location.href = post.permalink;
        } else {
          printText('cd: ' + args[0] + ': no such directory', 'term-err');
          reveal();
        }
      });
    }
  };

  var history = [];
  var historyIndex = -1;

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    var trimmed = inputEl.value.trim();
    inputEl.value = '';
    if (!trimmed) return;
    history.push(trimmed);
    historyIndex = history.length;
    printCommandLine(trimmed);
    reveal();
    var parts = trimmed.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1);
    var handler = COMMANDS[cmd];
    if (handler) {
      handler(args);
    } else {
      printText(cmd === 'sudo' ? 'nice try.' : 'zsh: command not found: ' + cmd, 'term-err');
      reveal();
    }
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp') {
      if (historyIndex > 0) {
        historyIndex--;
        inputEl.value = history[historyIndex];
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        inputEl.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        inputEl.value = '';
      }
      e.preventDefault();
    }
  });

  document.querySelector('.site-footer').addEventListener('click', function (e) {
    if (e.target === inputEl || e.target.closest('a')) return;
    inputEl.focus();
  });
})();
