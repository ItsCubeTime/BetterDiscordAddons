/**
 * @name NotificationWhitelist
 * @author DeathByPrograms
 * @description Allows servers and channels to be added to a notification whitelist
 * @version 1.2.0
 * @authorId 234086939102281728
 * @website https//github.com/deathbyprograms/BetterDiscordAddons/tree/main/dist/NotificationWhitelist
 * @source https//github.com/deathbyprograms/BetterDiscordAddons/blob/main/dist/NotificationWhitelist/NotificationWhitelist.plugin.js
 */

const VERSION = "1.2.0";
const CHANGELOG = {
  "1.2.0": [
    {
      title: "New Features",
      type: "added",
      items: [
        "Added the ability to blacklist channels and servers. You can now find that toggle in those context menus. Note that blacklists take priority over whitelists.",
        "Added a setting to disable filtering of DMs and group DMs. Turning this off will allow all notifications for DMs and group DMs.",
      ],
    },
    {
      title: "Bug fixes",
      type: "fixed",
      items: [
        "Fixed the settings panel and context menu toggles breaking when using the plugin for the first time.",
      ],
    },
  ],
};

const DEFAULT_SETTINGS = {
  folderWhitelist: [],
  serverWhitelist: [],
  serverBlacklist: [],
  channelWhitelist: [],
  channelBlacklist: [],
  enableWhitelisting: true,
  filterDMs: true,
  allowNonMessageNotifications: false,
  useCustomNotificationSound: false,
  customNotificationSoundBytes: [],
  displayCustomToaster: false,
};


/**
 * @param {Uint8Array} array 
 */
function playByteArrayAsAudio(array) {
  let _playByteArrayAsAudio_context = new AudioContext();
    _playByteArrayAsAudio_context.decodeAudioData(array.slice(0).buffer, function (audioBuffer) { /* We duplicate the array with slice, or else we get an error 'Cannot decode detached ArrayBuffer' the second time we try using it to play audio */
        let source = _playByteArrayAsAudio_context.createBufferSource();
        source.connect(_playByteArrayAsAudio_context.destination);
        source.buffer = audioBuffer;
        source.start(0);
    });
}

/**
 * @param {Uint8Array} array 
 * @return {String}
 */
function arrayBufferToString(array) {
  return JSON.stringify(Array.from(array));
}

/**
 * @param {String} str
 * @return {Uint8Array}
 */
function stringToArrayBuffer(str) {
  const array = JSON.parse(str);
  const uint8Array = new Uint8Array(array);
  return uint8Array;
}


module.exports = class {
  constructor() {
    // Initialize the settings for the plugin
    this.settings = structuredClone(DEFAULT_SETTINGS);

    this.modules = {};
  }

  start() {
    BdApi.Logger.info("NotificationWhitelist", "Plugin enabled!");
    this.handleChangelog();

    this.loadSettings();

    // Get webpack modules
    this.modules.folderModule = BdApi.Webpack.getByKeys("getGuildFolderById");
    this.modules.notifModule = BdApi.Webpack.getByKeys(
      "showNotification",
      "requestPermission"
    );
    this.modules.channelStore = BdApi.Webpack.getStore("ChannelStore");

    this.contextPatchRemovers = [];

    // Add the whitelist option to the server and folder context menu.
    this.contextPatchRemovers.push(
      BdApi.ContextMenu.patch("guild-context", (res, props) => {
        res.props.children.push(
          BdApi.ContextMenu.buildItem({ type: "separator" })
        );

        // Check if the context menu is for a server.
        if (props.guild) {
          // Add server whitelist toggle
          res.props.children.push(
            BdApi.ContextMenu.buildItem({
              type: "toggle",
              label: "Notifications Whitelisted",
              checked: this.settings.serverWhitelist.includes(props.guild.id),
              action: (_) => {
                this.toggleWhitelisted(
                  props.guild.id,
                  this.settings.serverWhitelist
                );
              },
            })
          );
          // Add server blacklist toggle
          res.props.children.push(
            BdApi.ContextMenu.buildItem({
              type: "toggle",
              label: "Notifications Blacklisted",
              checked: this.settings.serverBlacklist.includes(props.guild.id),
              action: (_) => {
                this.toggleBlacklisted(
                  props.guild.id,
                  this.settings.serverBlacklist
                );
              },
            })
          );
          // Check if the context menu is for a folder.
        } else if (props.folderId) {
          // Add folder whitelist toggle
          res.props.children.push(
            BdApi.ContextMenu.buildItem({
              type: "toggle",
              label: "Notifications Whitelisted",
              checked: this.settings.folderWhitelist.includes(props.folderId),
              action: (_) => {
                this.toggleWhitelisted(
                  props.folderId,
                  this.settings.folderWhitelist
                );
              },
            })
          );
        }
      })
    );

    // Add the whitelist option to the channel context menu.
    this.contextPatchRemovers.push(
      BdApi.ContextMenu.patch("channel-context", (res, props) => {
        res.props.children.push(
          BdApi.ContextMenu.buildItem({ type: "separator" })
        );
        // Add channel whitelist toggle
        res.props.children.push(
          BdApi.ContextMenu.buildItem({
            type: "toggle",
            label: "Notifications Whitelisted",
            checked: this.settings.channelWhitelist.includes(props.channel.id),
            action: (_) => {
              this.toggleWhitelisted(
                props.channel.id,
                this.settings.channelWhitelist
              );
            },
          })
        );
        // Add channel blacklist toggle
        res.props.children.push(
          BdApi.ContextMenu.buildItem({
            type: "toggle",
            label: "Notifications Blacklisted",
            checked: this.settings.channelBlacklist.includes(props.channel.id),
            action: (_) => {
              this.toggleBlacklisted(
                props.channel.id,
                this.settings.channelBlacklist
              );
            },
          })
        );
      })
    );

    // Add the whitelist option to the DM context menu for single users.
    this.contextPatchRemovers.push(
      BdApi.ContextMenu.patch("user-context", (res, props) => {
        res.props.children.push(
          BdApi.ContextMenu.buildItem({ type: "separator" })
        );
        res.props.children.push(
          BdApi.ContextMenu.buildItem({
            type: "toggle",
            label: "Notifications Whitelisted",
            checked: this.settings.channelWhitelist.includes(props.channel.id),
            action: (_) => {
              this.toggleWhitelisted(
                props.channel.id,
                this.settings.channelWhitelist
              );
            },
          })
        );
      })
    );

    // Add the whitelist option to the group DM context menu.
    this.contextPatchRemovers.push(
      BdApi.ContextMenu.patch("gdm-context", (res, props) => {
        res.props.children.push(
          BdApi.ContextMenu.buildItem({ type: "separator" })
        );
        res.props.children.push(
          BdApi.ContextMenu.buildItem({
            type: "toggle",
            label: "Notifications Whitelisted",
            checked: this.settings.channelWhitelist.includes(props.channel.id),
            action: (_) => {
              this.toggleWhitelisted(
                props.channel.id,
                this.settings.channelWhitelist
              );
            },
          })
        );
      })
    );
    // @note Using service workers, we would be able to create interactive messages (say, to add a button to all notifications that lets you quickly remove a user from the whitelist, or add him to the blacklist depending on the situation), however, I am not sure how this would be done in the context of BetterDiscord 
    // navigator.serviceWorker.register("sw.js");


    // Patch the showNotification function to intercept notifications if they are not whitelisted while whitelisting is enabled.
    BdApi.Patcher.instead(
      "NotificationWhitelist",
      this.modules.notifModule,
      "showNotification",
      (_, args, orig) => {
        let mod = this;
        function sendNotification() { 
          if (mod.settings.useCustomNotificationSound || mod.settings.displayCustomToaster) {
            if (mod.settings.useCustomNotificationSound) {
              mod.playCustomNotification();
            }
            if (mod.settings.displayCustomToaster) {
              // https://cdn.discordapp.com/avatars/990706984879812700/1168f6ade0d55236b10b0979d31e2824.webp?size=32
              // chrome.notifications.onButtonClicked.addListener((() => { console.log(`hi`) }));
              let notification = new Notification(args['1'], { /*buttons: [{ title: 'hi' }, { title:'there'}],*/ isClickable: true, silent: true, body: args['2'], icon: args[`0`] });
              notification.onclick = (() => {
                focus();
                mod.transitionTo(`https://discord.com/channels/${args['3'].guild_id ? args['3'].guild_id : '@me'}/${args['3'].channel_id}/${args['3'].message_id}`);
              });
              // console.log(`args:${JSON.stringify(args)}`);
              // notification.onclick = focus;
              // @note service worker version (template), see comment above
              // Notification.requestPermission().then((result) => {
              //   if (result === "granted") {
              //     navigator.serviceWorker.ready.then((registration) => {
              //       registration.showNotification("Howdy hey", {
              //         body: "Jeeeehaaaw",
              //         icon: `https://cdn.discordapp.com/avatars/${args['4'].messageRecord.author.id}/${args['4'].messageRecord.author.avatar}.webp?size=128`,
              //         actions: [
              //           {
              //             action: 'reomveFromWhitelist',
              //             title: 'Un-whitelist',
              //           },
              //           {
              //             action: 'enableFocusMode',
              //             title: 'Enable focus mode',
              //           },
              //         ],
              //       });
              //     });
              //   }
              // });
            }
            return new Promise((resolve) => {
              resolve();
            });
          } else {
            return orig(...args);
          }
        }
        if (!this.settings.enableWhitelisting) return sendNotification(); // If whitelisting is disabled, allow the notification.
        if (!args[3]) return sendNotification(); // If the showNotification function is somehow called without the proper information, allow the notification.

        const notif = args[3];

        if (
          this.settings.allowNonMessageNotifications &&
          !notif.channel_id &&
          !notif.guild_id
        )
          return sendNotification(); // If the notification is not for a channel or server (e.g. friend requests) and such notifications are allowed, allow the notification.

        if (!this.settings.filterDMs && this.isDMOrGroupDM(notif.channel_id))
          return sendNotification(); // If the notification is a DM or group DM and DMs aren't filtered, allow the notification.

        // If channel is blacklisted, skip all whitelist checks
        if (!this.isBlacklisted(notif.channel_id, notif.guild_id)) {
          if (this.settings.channelWhitelist.includes(notif.channel_id))
            return sendNotification(); // If the channel is whitelisted, allow the notification.
          if (
            notif.guild_id &&
            this.settings.serverWhitelist.includes(notif.guild_id)
          )
            return sendNotification(); // If the server is whitelisted, allow the notification.
          if (notif.guild_id && this.guildInFolderWhitelist(notif.guild_id))
            return sendNotification(); // If the folder is whitelisted, allow the notification.
        }
        BdApi.Logger.debug(
          "NotificationWhitelist",
          "Blocked notification: ",
          notif
        );
        return new Promise((resolve) => {
          resolve();
        });
      }
    );
  }

  stop() {
    BdApi.Logger.info("NotificationWhitelist", "Plugin disabled!");

    // Unpatch all the patches we made.
    BdApi.Patcher.unpatchAll("NotificationWhitelist");
    for (var patchRemover of this.contextPatchRemovers) patchRemover();
  }

  /**
   * Load settings from config file
   */
  loadSettings() {
    BdApi.Logger.debug("NotificationWhitelist", "Loading settings");
    if (!BdApi.Data.load("NotificationWhitelist", "settings"))
      BdApi.Data.save("NotificationWhitelist", "settings", DEFAULT_SETTINGS);
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...BdApi.Data.load("NotificationWhitelist", "settings"),
    };
  }

  /**
   * Save settings to config file
   */
  saveSettings() {
    BdApi.Logger.debug("NotificationWhitelist", "Saving settings");
    BdApi.Data.save("NotificationWhitelist", "settings", this.settings);
  }

  /**
   * Toggles the whitelisted status of the given id
   *
   * @param {string} id The id of the channel/server/folder to toggle
   * @param {Array<string>} arr The whitelist array to toggle the id in
   */
  toggleWhitelisted(id, arr) {
    if (arr.includes(id)) this.removeFromWhitelist(id, arr);
    else this.addToWhitelist(id, arr);
  }

  /**
   * Toggles the blacklisted status of the given id
   *
   * @param {string} id The id of the channel/server/folder to toggle
   * @param {Array<string>} arr The blacklist array to toggle the id in
   */
  toggleBlacklisted(id, arr) {
    if (arr.includes(id)) this.removeFromBlacklist(id, arr);
    else this.addToBlacklist(id, arr);
  }

  /**
   * Whitelists the given id
   *
   * @param {string} id The id of the channel/server/folder to whitelist
   * @param {Array<string>} arr The whitelist array to add the id to
   */
  addToWhitelist(id, arr) {
    BdApi.Logger.debug("NotificationWhitelist", "Adding to whitelist: ", id);
    if (!arr.includes(id)) {
      arr.push(id);
      this.saveSettings();
    }
  }

  /**
   * Blacklists the given id
   *
   * @param {string} id The id of the channel/server/folder to blacklist
   * @param {Array<string>} arr The blacklist array to add the id to
   */
  addToBlacklist(id, arr) {
    BdApi.Logger.debug("NotificationWhitelist", "Adding to blacklist: ", id);
    if (!arr.includes(id)) {
      arr.push(id);
      this.saveSettings();
    }
  }

  /**
   * Removes the given id from the whitelist
   *
   * @param {string} id The id of the channel/server/folder to remove from the whitelist
   * @param {Array<string>} arr The whitelist array to remove the id from
   */
  removeFromWhitelist(id, arr) {
    BdApi.Logger.debug(
      "NotificationWhitelist",
      "Removing from whitelist: ",
      id
    );
    if (arr.includes(id)) {
      arr.splice(arr.indexOf(id), 1);
      this.saveSettings();
    }
  }

  /**
   * Removes the given id from the blacklist
   *
   * @param {string} id The id of the channel/server/folder to remove from the blacklist
   * @param {Array<string>} arr The blacklist array to remove the id from
   */
  removeFromBlacklist(id, arr) {
    BdApi.Logger.debug(
      "NotificationWhitelist",
      "Removing from blacklist: ",
      id
    );
    if (arr.includes(id)) {
      arr.splice(arr.indexOf(id), 1);
      this.saveSettings();
    }
  }

  /**
   * Clears all whitelists
   */
  clearWhitelists() {
    BdApi.Logger.info("NotificationWhitelist", "Clearing whitelist!");
    this.settings.serverWhitelist = [];
    this.settings.folderWhitelist = [];
    this.settings.channelWhitelist = [];
    this.saveSettings();
  }

  /**
   * Clears all blacklists
   */
  clearBlacklists() {
    BdApi.Logger.info("NotificationWhitelist", "Clearing blacklist!");
    this.settings.serverBlacklist = [];
    this.settings.channelBlacklist = [];
    this.saveSettings();
  }

  
  _playCustomNotification_arrayBuffer = undefined;
  /** Plays audio from this.settings.customNotificationSoundBytes, provided by the user */
  playCustomNotification() {
    if (!this._playCustomNotification_arrayBuffer) { this._playCustomNotification_arrayBuffer = stringToArrayBuffer(this.settings.customNotificationSoundBytes); }
    playByteArrayAsAudio(this._playCustomNotification_arrayBuffer);
  }

  _transitionTo_nativeFunc = undefined;
  /**
   * @param {String} url 
   */
  transitionTo(url) {
    if (!this._transitionTo_nativeFunc) { this._transitionTo_nativeFunc = BdApi.Webpack.getModule(m => m?.toString?.().includes(`"transitionTo - Transitioning to "`), { searchExports: true }); }
    this._transitionTo_nativeFunc(url,'');
  }

  getSettingsPanel() {
    return BdApi.UI.buildSettingsPanel({
      settings: [
        {
          type: "switch",
          id: "enableWhitelisting",
          name: "Enable whitelisting",
          note: "Enables notification whitelisting. Note: turning this on without any whitelisted channels/servers will disable all notifications.",
          value: this.settings.enableWhitelisting,
          onChange: ((value) => {
            this.settings.enableWhitelisting = value;
          }).bind(this),
        },
        {
          type: "switch",
          id: "filterDMs",
          name: "Filter DMs",
          note: "Applies the whitelist and blacklist to DMs. Disabling this will lead to all notifications for DMs and group DMs being allowed.",
          value: this.settings.filterDMs,
          onChange: ((value) => {
            this.settings.filterDMs = value;
          }).bind(this),
        },
        {
          type: "switch",
          id: "allowNonMessageNotifications",
          name: "Allow non-message notifications",
          note: "Allows notifications that are not for messages to be shown (e.g. friend requests).",
          value: this.settings.allowNonMessageNotifications,
          onChange: ((value) => {
            this.settings.allowNonMessageNotifications = value;
          }).bind(this),
        },
        {
          type: "button",
          id: "clearWhitelist",
          name: "Clear whitelist",
          note: "",
          children: "Clear",
          color: BdApi.Components.Button.Colors.RED,
          size: BdApi.Components.Button.Sizes.SMALL,
          onClick: () => {
            BdApi.UI.showConfirmationModal(
              "Really Clear Whitelists?",
              "Are you sure you want to clear your notification whitelists? This is irreversible",
              {
                danger: true,
                confirmText: "Clear",
                onConfirm: this.clearWhitelists.bind(this),
              }
            );
          },
        },
        {
          type: "button",
          id: "clearBlacklist",
          name: "Clear blacklist",
          note: "",
          children: "Clear",
          color: BdApi.Components.Button.Colors.RED,
          size: BdApi.Components.Button.Sizes.SMALL,
          onClick: () => {
            BdApi.UI.showConfirmationModal(
              "Really Clear Blacklists?",
              "Are you sure you want to clear your notification blacklists? This is irreversible",
              {
                danger: true,
                confirmText: "Clear",
                onConfirm: this.clearBlacklists.bind(this),
              }
            );
          },
        },
        /* custom notification sound */
        {
          type: "switch",
          id: "useCustomNotificationSound",
          name: "Use custom notification sound",
          note: "Plays an audio file whenever a notification is received instead of the default notification sound. Enabling this will also disable other default notification behavior, such as a desktop toaster showing up.",
          value: this.settings.useCustomNotificationSound,
          onChange: ((value) => {
            this.settings.useCustomNotificationSound = value;
            this.saveSettings();
          }).bind(this),
        },
        {
          type: "button",
          id: "pickCustomNotificationSoundFilePath",
          name: "Pick custom notification sound",
          note: "Only relevant if 'Use custom notification sound' is enabled.",
          children: "Pick custom notification sound",
          color: BdApi.Components.Button.Colors.BLUE,
          size: BdApi.Components.Button.Sizes.SMALL,
          onClick: async () => {
            /** @type {FileSystemFileHandle} */
            let fileHandle;
            [fileHandle] = await window.showOpenFilePicker();
            let fileData = await fileHandle.getFile();
            let audioBytes = await fileData.arrayBuffer();
            this.settings.customNotificationSoundBytes = arrayBufferToString(new Uint8Array(audioBytes));
            this.saveSettings();
            this._playCustomNotification_arrayBuffer = undefined; /* Makes sure we use the new audio */
            this.playCustomNotification();
          },
        },
        /* display custom toaster */
        {
          type: "switch",
          id: "displayCustomToaster",
          name: "Display custom desktop notification/toaster",
          note: "Enabling this will also disable other default notification behavior, such as the default Discord notification sound.",
          value: this.settings.displayCustomToaster,
          onChange: ((value) => {
            this.settings.displayCustomToaster = value;
            this.saveSettings();
          }).bind(this),
        },
      ],
      onChange: this.saveSettings.bind(this),
    });
  }

  /**
   * Checks whether the given guild is in a whitelisted folder
   *
   * @param {string} guildId The guild id to check
   * @returns {boolean} Whether the guild is in a whitelisted folder
   */
  guildInFolderWhitelist(guildId) {
    return this.settings.folderWhitelist.some((folderId) =>
      this.modules.folderModule
        .getGuildFolderById(folderId)
        .guildIds.includes(guildId)
    );
  }

  /**
   * Checks whether the given channel is blacklisted
   *
   * @param {string} channelId The channel id to check
   * @param {string|undefined} guildId The guild id to check
   * @returns {boolean} Whether the channel is blacklisted or not
   */
  isBlacklisted(channelId, guildId) {
    return (
      this.settings.channelBlacklist.includes(channelId) ||
      (guildId && this.settings.serverBlacklist.includes(guildId))
    );
  }

  /**
   * Checks whether the given channel is a DM or group DM
   *
   * @param {string} channelId The channel id to check
   * @returns {boolean} Whether the channel is a DM or group DM or not
   */
  isDMOrGroupDM(channelId) {
    const channel = this.modules.channelStore.getChannel(channelId);
    return channel.isDM() || channel.isGroupDM();
  }

  /**
   * Check version and show changelog if updated
   */
  handleChangelog() {
    const lastUsedVersion = BdApi.Data.load(
      "NotificationWhitelist",
      "currentVersion"
    );

    if (
      !lastUsedVersion ||
      BdApi.Utils.semverCompare(lastUsedVersion, VERSION) === 1
    ) {
      BdApi.UI.showChangelogModal({
        title: `Notification Whitelist ${VERSION}`,
        changes: CHANGELOG[VERSION],
      });
    }

    BdApi.Data.save("NotificationWhitelist", "currentVersion", VERSION);
  }
};
