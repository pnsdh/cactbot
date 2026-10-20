using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

namespace Cactbot {
  // Fork: tells the overlays when a user file (js, ts, css or a timeline's txt) changed, so that
  // they load it again (user_config.ts waits for a fight to end first).  Only the user
  // directories files were read from are watched, and in them only what the overlays read: the
  // files at the top and the folders named after overlays (see GetLocalUserFiles; not e.g. the
  // cactbot-types an update rewrites).  An editor writes a file in several steps, so changes are
  // told once they stop for a moment.
  public class UserDirWatcher {
    private const int QuietMs = 1500;
    // A directory that keeps failing (a flaky network drive) reloads the overlays at most this
    // often: later notices wait, rather than being dropped (only a reload watches it again).
    private const int ErrorNoticeMs = 30000;
    private static readonly HashSet<string> kExtensions =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".js", ".ts", ".css", ".txt" };

    private readonly Action<string> changed_;
    private readonly Dictionary<string, FileSystemWatcher> watchers_ =
        new Dictionary<string, FileSystemWatcher>(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> overlays_ = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    private readonly Timer timer_;
    private readonly object sync_ = new object();
    private string last_file_;
    private bool stopped_;
    private DateTime last_error_notice_ = DateTime.MinValue;

    public UserDirWatcher(Action<string> changed) {
      changed_ = changed;
      timer_ = new Timer(_ => Tell(), null, Timeout.Infinite, Timeout.Infinite);
    }

    public void Watch(string dir, string overlay) {
      lock (sync_) {
        stopped_ = false;
        if (!String.IsNullOrEmpty(overlay))
          overlays_.Add(overlay);
        if (String.IsNullOrEmpty(dir))
          return;
        dir = Path.GetFullPath(dir);
        // Not a drive's root (D:\): without the backslash it would be D:'s current directory.
        if (dir.Length > 3)
          dir = dir.TrimEnd('\\');
        if (watchers_.ContainsKey(dir) || !Directory.Exists(dir))
          return;
        var watcher = new FileSystemWatcher(dir) {
          IncludeSubdirectories = true,
          NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.DirectoryName,
        };
        watcher.Changed += (o, e) => OnChange(dir, e.FullPath);
        watcher.Created += (o, e) => OnChange(dir, e.FullPath);
        watcher.Deleted += (o, e) => OnChange(dir, e.FullPath);
        watcher.Renamed += (o, e) => {
          OnChange(dir, e.OldFullPath);
          OnChange(dir, e.FullPath);
        };
        // It stops by itself when it fails (its directory deleted, a network drive gone, too many
        // changes at once): the next load watches the directory again.  What changed is unknown.
        watcher.Error += (o, e) => {
          lock (sync_) {
            FileSystemWatcher current;
            if (watchers_.TryGetValue(dir, out current) && current == watcher) {
              watchers_.Remove(dir);
              watcher.Dispose();
            }
            // One already coming covers this error too (several folders failing together).
            var now = DateTime.UtcNow;
            if (last_error_notice_ > now)
              return;
            var wait = Math.Min(ErrorNoticeMs, Math.Max(QuietMs, (last_error_notice_.AddMilliseconds(ErrorNoticeMs) - now).TotalMilliseconds));
            last_error_notice_ = now.AddMilliseconds(wait);
            last_file_ = null;
            timer_.Change((int)wait, Timeout.Infinite);
          }
        };
        // Registered first: an error raised as it starts (some network shares) finds and drops it.
        watchers_[dir] = watcher;
        try {
          watcher.EnableRaisingEvents = true;
        } catch (Exception) {
          watchers_.Remove(dir);
          watcher.Dispose();
          throw;
        }
      }
    }

    private void OnChange(string dir, string path) {
      // Editors' backup and swap files are not user files.
      if (!kExtensions.Contains(Path.GetExtension(path)))
        return;
      // A file at the top, or in a folder named after an overlay (the first one in the path).
      var relative = path.Length > dir.Length ? path.Substring(dir.Length).TrimStart('\\') : "";
      int slash = relative.IndexOf('\\');
      if (slash >= 0) {
        lock (sync_) {
          if (!overlays_.Contains(relative.Substring(0, slash)))
            return;
        }
      }
      Changed(path);
    }

    private void Changed(string path) {
      lock (sync_) {
        last_file_ = path;
        timer_.Change(QuietMs, Timeout.Infinite);
      }
    }

    private void Tell() {
      string file;
      lock (sync_) {
        if (stopped_)
          return;
        file = last_file_;
      }
      changed_(file);
    }

    // Until directories are watched again (as the overlays load their files).
    public void Stop() {
      lock (sync_) {
        stopped_ = true;
        timer_.Change(Timeout.Infinite, Timeout.Infinite);
        foreach (var watcher in watchers_.Values) {
          watcher.EnableRaisingEvents = false;
          watcher.Dispose();
        }
        watchers_.Clear();
      }
    }
  }
}
