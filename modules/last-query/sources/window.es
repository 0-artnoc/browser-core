import AppWindow from '../core/base/window';
import SearchHistoryUI from './ui';
import inject from '../core/kord/inject';
import { getCurrentTabId } from '../core/tabs';
import { isUrl, getDetailsFromUrl } from '../core/url';

export default class LastQueryWindow extends AppWindow {
  deps = {
    core: inject.module('core'),
    ui: inject.module('ui'),
  };

  actions = {
    updateTabQuery: (tabId, query) => this.searchHistoryUI.updateTabQuery(tabId, query),
  };

  events = {
    'urlbar:focus': () => {
      this.searchHistoryUI.hide();
    },

    'urlbar:blur': () => {
      this.searchHistoryUI.showTabQuery(getCurrentTabId(this.window));
    },

    'urlbar:keydown': ({ code, query, isHandledByCliqz, tabId }) => {
      if ((code !== 'Enter') && (code !== 'NumpadEnter')) {
        return;
      }

      // will be handled with ui:cliqz-on-url event
      if (isHandledByCliqz) {
        return;
      }

      if (isUrl(query)) {
        return;
      }

      this.queriesNotHandledByCliqz.add(query);
      this.ignoreNextLoad = true;
      this.searchHistoryUI.updateTabQuery(tabId, query);
      this.searchHistoryUI.show(query);
    },

    /*
     * Hide last query when new navigation has started
     */
    'content:location-change': ({ url, originalUrl, referrer, triggeringUrl, tabId }) => {
      const potentialQuery = getDetailsFromUrl(url).host;

      if (getCurrentTabId(this.window) !== tabId) {
        return;
      }

      if (this.ignoreNextLoad) {
        this.ignoreNextLoad = false;

        // if the hostname is the query the last query should be removed
        if (this.queriesNotHandledByCliqz.has(potentialQuery)) {
          this.queriesNotHandledByCliqz.delete(potentialQuery);
        } else {
          return;
        }
      }

      // Clear the last query if visit was triggered not by navigation, eg.
      // bookmarks, history, speed dials
      if (referrer || triggeringUrl) {
        return;
      }

      if (this.searchedUrls.has(url)) {
        this.searchedUrls.delete(url);
        return;
      }

      if (this.searchedUrls.has(originalUrl)) {
        this.searchedUrls.delete(originalUrl);
        return;
      }

      if (this.searchedUrls.has(triggeringUrl)) {
        this.searchedUrls.delete(triggeringUrl);
        return;
      }

      this.searchHistoryUI.hide();
      this.searchHistoryUI.clearTabQuery(tabId);
    },

    'core:tab_select': ({ tabId }) => {
      this.searchHistoryUI.hide();
      this.searchHistoryUI.showTabQuery(tabId);
    },

    'core:tab_close': ({ tabId }) => {
      this.searchHistoryUI.clearTabQuery(tabId);
    },

    'ui:click-on-url': ({ isNewTab, tabId, url, query, isFromAutocompletedURL, isPrivateMode }) => {
      if (isNewTab || isPrivateMode || !url || isFromAutocompletedURL) {
        this.searchHistoryUI.hide();
        return;
      }

      if (isUrl(query)) {
        return;
      }

      this.searchedUrls.add(url);
      this.searchHistoryUI.updateTabQuery(tabId, query);
      this.searchHistoryUI.show(query);
    },
  };

  constructor(settings) {
    super(settings);
    this.searchedUrls = new Set();
    this.queriesNotHandledByCliqz = new Set();
    this.ignoreNextLoad = false;
    this.searchHistoryUI = new SearchHistoryUI(
      this.window,
      query => this.deps.core.action('queryCliqz', query),
    );
  }

  init() {
    super.init();
    return this.deps.ui.isWindowReady(this.window).then(() => {
      this.searchHistoryUI.attach();
    });
  }

  unload() {
    super.unload();
    this.searchHistoryUI.deattach();
  }
}
