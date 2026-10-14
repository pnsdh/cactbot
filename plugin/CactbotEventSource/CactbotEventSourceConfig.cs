using RainbowMage.OverlayPlugin;
using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using CactbotEventSource.loc;

namespace Cactbot {
  [Serializable]
  public class CactbotEventSourceConfig {
    public CactbotEventSourceConfig() {
    }

    public static CactbotEventSourceConfig LoadConfig(IPluginConfig pluginConfig, ILogger logger) {
      var result = new CactbotEventSourceConfig();

      if (pluginConfig.EventSourceConfigs.ContainsKey("CactbotESConfig")) {
        var obj = pluginConfig.EventSourceConfigs["CactbotESConfig"];

        if (obj.TryGetValue("OverlayData", out JToken value)) {
          try {
            result.OverlayData = value.ToObject<Dictionary<string, JToken>>();
          } catch (Exception e) {
            logger.Log(LogLevel.Error, Strings.LoadOverlayDataSettingsFailed, e.ToString());
          }
        }

        if (obj.TryGetValue("LastUpdateCheck", out value)) {
          try {
            result.LastUpdateCheck = value.ToObject<DateTime>();
          } catch (Exception e) {
            logger.Log(LogLevel.Error, Strings.LoadLastUpdateCheckSettingsFailed, e.ToString());
          }
        }
      }

      return result;
    }

    public void SaveConfig(IPluginConfig pluginConfig) {
      lock (OverlayDataLock) {
        pluginConfig.EventSourceConfigs["CactbotESConfig"] = JObject.FromObject(this);
      }
    }

    public Dictionary<string, JToken> OverlayData = null;

    // Fork: guards OverlayData, written by overlays' calls while the config is saved (a
    // Dictionary changed during the save's enumeration threw, and the save was skipped).
    [JsonIgnore]
    public readonly object OverlayDataLock = new object();

    public DateTime LastUpdateCheck;

    [JsonIgnore]
    public string DisplayLanguage {
      get {
        lock (OverlayDataLock) {
          if (!OverlayData.TryGetValue("options", out JToken options))
            return null;
          var general = options["general"];
          if (general == null)
            return null;
          var dir = general["DisplayLanguage"];
          if (dir == null)
            return null;
          return dir.ToString();
        }
      }
    }

    [JsonIgnore]
    public string UserConfigFile {
      get {
        lock (OverlayDataLock) {
          if (!OverlayData.TryGetValue("options", out JToken options))
            return null;
          var general = options["general"];
          if (general == null)
            return null;
          var dir = general["CactbotUserDirectory"];
          if (dir == null)
            return null;
          return dir.ToString();
        }
      }
      set {
        lock (OverlayDataLock) {
          if (!OverlayData.TryGetValue("options", out JToken options)) {
            options = new JObject();
            OverlayData.Add("options", options);
          }
          var general = options["general"];
          if (general == null) {
            general = new JObject();
            options["general"] = general;
          }
          general["CactbotUserDirectory"] = value;
        }
      }
    }
  }
}
