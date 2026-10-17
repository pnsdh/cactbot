using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

namespace Cactbot {
  // Fork, for development (a game patch): whether cactbot's own memory reading (the player's
  // entity, see FFXIVProcess*) still has the right layout.  Every few seconds the player cactbot
  // reads is compared with FFXIV_ACT_Plugin's, which reads the same memory with its own,
  // separately maintained layout.  Summaries go to %TEMP%\op-selfcheck.log each minute (with
  // OverlayPlugin's own check).  Off unless %TEMP%\op-selfcheck.enable exists when ACT starts.
  public class SelfCheck : IDisposable {
    public static readonly bool Enabled =
        File.Exists(Path.Combine(Path.GetTempPath(), "op-selfcheck.enable"));
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), "op-selfcheck.log");
    private const int SampleMs = 3000;
    private const int SamplesPerSummary = 20;

    private readonly FFXIVProcess ffxiv_;
    private readonly FFXIVPlugin plugin_;
    private readonly Timer timer_;
    private readonly object sync_ = new object();
    private readonly SortedDictionary<string, int[]> fields_ = new SortedDictionary<string, int[]>();
    private readonly Dictionary<string, string> examples_ = new Dictionary<string, string>();
    private int samples_;
    private int compared_;

    public SelfCheck(FFXIVProcess ffxiv, FFXIVPlugin plugin) {
      ffxiv_ = ffxiv;
      plugin_ = plugin;
      Write("--- cactbot self check started");
      timer_ = new Timer(_ => Sample(), null, SampleMs, SampleMs);
    }

    public void Dispose() {
      timer_.Dispose();
    }

    private void Sample() {
      lock (sync_) {
        try {
          if (ffxiv_.HasProcess())
            Compare();
        } catch (Exception e) {
          Write("cactbot error: " + e.GetType().Name + ": " + e.Message);
        }
        if (++samples_ % SamplesPerSummary == 0)
          Summarize();
      }
    }

    private void Compare() {
      var self = ffxiv_.GetSelfData();
      dynamic repo = plugin_.GetDataRepository();
      if (self == null || repo == null)
        return;
      uint playerId = (uint)repo.GetCurrentPlayerID();
      dynamic player = null;
      foreach (dynamic c in repo.GetCombatantList()) {
        if ((uint)c.ID == playerId) {
          player = c;
          break;
        }
      }
      if (player == null)
        return;
      compared_++;
      Check("id", self.id, (uint)player.ID);
      Check("name", self.name == (string)player.Name, null);
      Check("job", (int)self.job, (int)player.Job);
      Check("level", (int)self.level, (int)player.Level);
      Check("hp", (uint)self.hp, (uint)player.CurrentHP);
      Check("max_hp", (uint)self.max_hp, (uint)player.MaxHP);
      Check("mp", (uint)self.mp, (uint)player.CurrentMP);
      // cactbot keeps memory's axes; FFXIV_ACT_Plugin swaps y and z.
      CheckNear("pos_x", self.pos_x, (float)player.PosX, 0.1f);
      CheckNear("pos_y (height)", self.pos_y, (float)player.PosZ, 0.1f);
      CheckNear("pos_z", self.pos_z, (float)player.PosY, 0.1f);
      CheckNear("rotation", self.rotation, (float)player.Heading, 0.05f);
    }

    private void Check<T>(string name, T mine, T theirs) {
      Record(name, EqualityComparer<T>.Default.Equals(mine, theirs), mine + " vs " + theirs);
    }

    private void Check(string name, bool same, string example) {
      Record(name, same, example ?? "(values not shown)");
    }

    private void CheckNear(string name, float mine, float theirs, float tolerance) {
      Record(name, Math.Abs(mine - theirs) <= tolerance,
          string.Format(CultureInfo.InvariantCulture, "{0:F3} vs {1:F3}", mine, theirs));
    }

    private void Record(string name, bool same, string example) {
      if (!fields_.TryGetValue(name, out var counts))
        fields_[name] = counts = new int[2];
      counts[0]++;
      if (!same) {
        counts[1]++;
        if (!examples_.ContainsKey(name))
          examples_[name] = example;
      }
    }

    private void Summarize() {
      if (compared_ == 0)
        return;
      var text = new StringBuilder();
      text.AppendFormat("cactbot player, {0} samples vs FFXIV_ACT_Plugin:\r\n", compared_);
      foreach (var kv in fields_) {
        double share = 100.0 * kv.Value[1] / Math.Max(kv.Value[0], 1);
        string level = share > 50 ? "BROKEN?" : share > 10 ? "odd" : "ok";
        text.AppendFormat(CultureInfo.InvariantCulture, "  {0,-7} {1,-16} {2,5:F1}%{3}\r\n", level, kv.Key, share,
            kv.Value[1] > 0 ? "  e.g. " + examples_[kv.Key] : "");
      }
      Write(text.ToString().TrimEnd());
      fields_.Clear();
      examples_.Clear();
      compared_ = 0;
    }

    private static void Write(string text) {
      try {
        File.AppendAllText(LogPath, DateTime.Now.ToString("HH:mm:ss") + " " + text + "\r\n", Encoding.UTF8);
      } catch (Exception) {
      }
    }
  }
}
