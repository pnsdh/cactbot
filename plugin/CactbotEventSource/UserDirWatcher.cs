using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

namespace Cactbot {
  // Fork: tells the overlays when a user file (js, ts, css or a timeline's txt) changed, so that
  // they load it again (user_config.ts waits for a fight to end first).  Only the user
  // directories files were read from are watched.  An editor writes a file in several steps, so
  // changes are told once they stop for a moment.
  public class UserDirWatcher {
    private const int QuietMs = 500;
    private static readonly HashSet<string> kExtensions =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".js", ".ts", ".css", ".txt" };

    private readonly Action<string> changed_;
    private readonly Dictionary<string, FileSystemWatcher> watchers_ =
        new Dictionary<string, FileSystemWatcher>(StringComparer.OrdinalIgnoreCase);
    private readonly Timer timer_;
    private readonly object sync_ = new object();
    private string last_file_;

    public UserDirWatcher(Action<string> changed) {
      changed_ = changed;
      timer_ = new Timer(_ => Tell(), null, Timeout.Infinite, Timeout.Infinite);
    }

    public void Watch(string dir) {
      lock (sync_) {
        if (String.IsNullOrEmpty(dir) || watchers_.ContainsKey(dir) || !Directory.Exists(dir))
          return;
        var watcher = new FileSystemWatcher(dir) {
          IncludeSubdirectories = true,
          NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.DirectoryName,
        };
        watcher.Changed += (o, e) => OnChange(e.FullPath);
        watcher.Created += (o, e) => OnChange(e.FullPath);
        watcher.Deleted += (o, e) => OnChange(e.FullPath);
        watcher.Renamed += (o, e) => {
          OnChange(e.OldFullPath);
          OnChange(e.FullPath);
        };
        watcher.EnableRaisingEvents = true;
        watchers_[dir] = watcher;
      }
    }

    private void OnChange(string path) {
      // Editors' backup and swap files are not user files.
      if (!kExtensions.Contains(Path.GetExtension(path)))
        return;
      lock (sync_) {
        last_file_ = path;
        timer_.Change(QuietMs, Timeout.Infinite);
      }
    }

    private void Tell() {
      string file;
      lock (sync_) {
        if (watchers_.Count == 0)
          return;
        file = last_file_;
      }
      changed_(file);
    }

    // Until directories are watched again (as the overlays load their files).
    public void Stop() {
      lock (sync_) {
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
