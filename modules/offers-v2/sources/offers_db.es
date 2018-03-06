import logger from './common/offers_v2_logger';
import OffersConfigs from './offers_configs';
import DBHelper from './db_helper';
import { timestampMS } from './utils';
import setTimeoutInterval from '../core/helpers/timeout';

const STORAGE_DB_DOC_ID = 'offers-db';

/**
 * This class will be used to hold all the information related to offers locally.
 * Will be the index for:
 * - offers object stored locally (storage).
 * - Signals we want to track per offer (history).
 * - index to retrieve offers from campaigns and campaigns from offers, etc.
 *
 */
class OfferDB {
  constructor(offersDB) {
    this.db = new DBHelper(offersDB);

    // we will hold here the index data needed in a very basic and non duplicated
    // form, all the other index tables will be built after loaded from disk.
    // {
    //    // offer_id -> offer container information (main data)
    //    offers_index: {},
    //    // display_id -> (action_id -> action_container)
    //    display_ids_index: {}
    // }
    this.dataIndex = {
      offers_index: {},
      display_id_index: {}
    };

    // load and clean
    this._loadPersistentData();

    // temporary mapping counter to know when to remove a display or not
    this.displayIDCounter = {};

    // we will dynamically keep track of which offers are related to a particular
    // campaign id: campaign_id -> Set(offersIDs)
    this.campaignToOffersMap = {};

    this.dbDirty = false;

    // save offers in a frequent way
    const self = this;
    if (OffersConfigs.LOAD_OFFERS_STORAGE_DATA) {
      this.saveInterval = setTimeoutInterval(() => {
        if (self.dbDirty) {
          self._savePersistentData();
        }
      }, OffersConfigs.OFFERS_STORAGE_AUTOSAVE_FREQ_SECS * 1000);
    }
  }

  destroy() {
    this.savePersistentData();
    if (this.saveInterval) {
      this.saveInterval.stop();
      this.saveInterval = null;
    }
  }

  savePersistentData() {
    return this._savePersistentData();
  }

  loadPersistentData() {
    return this._loadPersistentData();
  }

  // ---------------------------------------------------------------------------
  // The public methods will go here
  // ---------------------------------------------------------------------------

  /**
   * will return the metadata for a particular offer or null if not exists
   * @param  {string} offerID the offer id
   * @return {object} metadata or null if not exists.
   * <pre>
   * {
   *   c_ts: when was created timestamp
   *   l_u_ts: when was last updated timestamp (any interaction).
   * }
   * </pre>
   */
  getOfferMeta(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      return null;
    }
    return {
      c_ts: container.c_ts,
      l_u_ts: container.l_u_ts
    };
  }

  /**
   * adds a new offer object, this should be the object coming from the backend
   * with all the required fields
   * @param {[type]} offerID   [description]
   * @param {[type]} offerData [description]
   * @return {bool} true if was added | false otherwise
   */
  addOfferObject(offerID, offerData) {
    if (!this._isOfferValid(offerID, offerData)) {
      logger.warn(`addOfferObject: args invalid or data invalid: ${offerID} - ${offerData}`);
      return false;
    }

    let container = this.dataIndex.offers_index[offerID];
    if (container) {
      logger.warn(`addOfferObject: The offer id: ${offerID} already exists, will not add it here`);
      return false;
    }

    // create the container and a copy of the offer data object to avoid issues
    const offerDataCpy = JSON.parse(JSON.stringify(offerData));
    container = this._createOfferContainer();
    container.offer_obj = offerDataCpy;
    this.dataIndex.offers_index[offerID] = container;

    // update index tables
    this._updateIndexTablesForOffer(offerID);

    // mark it as dirty
    this._markOfferDirty(offerID);

    return true;
  }

  /**
   * will remove the offer object but not the action history
   * @param  {[type]} offerID [description]
   * @return {boolean} true on success false otherwise
   */
  removeOfferObject(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`removeOfferObject: The offer id: ${offerID} is not stored`);
      return false;
    }

    // mark as dirty and update tables
    this._markOfferDirty(offerID);

    // we should not remove this since we relay still on accessing the display_id
    // information of the offer
    // this._removeIndexTablesForOffer(offerID);

    // remove the data
    // delete container.offer_obj;
    container.removed = true;

    // last update
    container.l_u_ts = timestampMS();

    return true;
  }

  /**
   * will return the offer object if we have it or null if not
   * Do not modify this object from outside.
   * @param  {[type]} offerID [description]
   * @return {[type]}         [description]
   */
  getOfferObject(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      return null;
    }
    return container.offer_obj;
  }

  /**
   * will check if there is information about the offer or not
   * @param  {[type]}  offerID [description]
   * @return {Boolean}         true if there are or false otherwise
   */
  hasOfferData(offerID) {
    return this.dataIndex.offers_index[offerID] !== undefined;
  }
  hasOfferObject(offerID) {
    if (this.getOfferObject(offerID)) {
      return true;
    }
    return false;
  }
  isOfferPresent(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      return false;
    }
    return !container.removed;
  }

  /**
   * will update an offer object.
   * @param  {[type]} offerID   [description]
   * @param  {[type]} offerData [description]
   * @return {boolean} true on success | false otherwise
   */
  updateOfferObject(offerID, offerData) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`updateOfferObject: the offer with ID: ${offerID} is not present`);
      return false;
    }
    // check if the offer is valid and is the same
    if (!this._isOfferValid(offerID, offerData)) {
      logger.warn(`updateOfferObject: offer ${offerID} is not valid`);
      return false;
    }

    if (container.offer_obj) {
      // check if we have an old object here
      const localOffer = container.offer_obj;
      if (offerData.offer_id !== localOffer.offer_id ||
          offerData.campaign_id !== localOffer.campaign_id ||
          offerData.display_id !== localOffer.display_id) {
        logger.warn('updateOfferObject: the offer core data is not similar? not supported for now');
        return false;
      }
    }
    // it is ok, we update the data
    container.offer_obj = JSON.parse(JSON.stringify(offerData));
    container.removed = false;

    // update timestamp
    this._markOfferDirty(offerID);
    container.l_u_ts = timestampMS();

    return true;
  }

  /**
   * this method will increment +1 a particular action for a given offer. This
   * will also update if needed the display ID
   * @param  {[type]} offerID  [description]
   * @param  {[type]} actionID [description]
   * @param  {[type]} incDisplay if true this will also increment the signal in the
   *                             display map.
   * @return {boolean} true on success | false otherwise
   */
  incOfferAction(offerID, actionID, incDisplay = true, count = 1) {
    if (!offerID || !actionID) {
      logger.warn('incOfferAction: invalid args');
      return false;
    }
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`incOfferAction: The offer id: ${offerID} is not stored`);
      return false;
    }

    const now = timestampMS();
    const offerObj = container.offer_obj;
    let actionCont = container.offer_actions[actionID];
    if (!actionCont) {
      // create a new one
      actionCont = this._createElementContainer();
      container.offer_actions[actionID] = actionCont;
      actionCont.count = 0;
    }
    actionCont.count += count;
    actionCont.l_u_ts = now;

    if (incDisplay) {
      const displayMap = this.dataIndex.display_id_index;
      let displayActionMap = displayMap[offerObj.display_id];
      if (!displayActionMap) {
        displayActionMap = {};
        displayMap[offerObj.display_id] = displayActionMap;
      }
      let displayCont = displayActionMap[actionID];
      if (!displayCont) {
        displayCont = this._createElementContainer();
        displayActionMap[actionID] = displayCont;
        displayCont.count = 0;
      }
      displayCont.count += count;
      displayCont.l_u_ts = now;
    }

    this._markOfferDirty(offerID);
    container.l_u_ts = now;

    return true;
  }

  /**
   * will return the metadata for a particular actionID and offerID.
   * @param  {[type]} offerID  [description]
   * @param  {[type]} actionID [description]
   * @return {object} the metadata for an action or null | undefined if not found
   * <pre>
   * {
   *   c_ts: timestamp,
   *   l_u_ts: timestamp,
   *   count: N,
   * }
   * </pre>
   */
  getOfferActionMeta(offerID, actionID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      return null;
    }
    return container.offer_actions[actionID];
  }

  /**
   * add a generic attribute data to be stored on the offer with a generic value
   * @param {[type]} offerID [description]
   * @param {[type]} attrID  [description]
   * @param {[type]} data    [description]
   * @return {boolean} true on success | false otherwise
   */
  addOfferAttribute(offerID, attrID, data) {
    if (!offerID || !attrID) {
      logger.warn('addOfferAttribute: invalid args');
      return false;
    }
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`addOfferAttribute: The offer id: ${offerID} is not stored`);
      return false;
    }

    const offerAttr = container.offer_attrs;
    let attrCont = offerAttr[attrID];
    if (!attrCont) {
      attrCont = this._createElementContainer();
      offerAttr[attrID] = attrCont;
    }

    const now = timestampMS();

    attrCont.attr = data;
    attrCont.l_u_ts = now;

    this._markOfferDirty(offerID);
    container.l_u_ts = now;

    return true;
  }

  /**
   * will return the associated attribute for the given offer and attrID, null if
   * not exists
   * @param  {[type]} offerID [description]
   * @param  {[type]} attrID  [description]
   * @return {[type]}         [description]
   */
  getOfferAttribute(offerID, attrID) {
    if (!offerID || !attrID) {
      logger.warn('getOfferAttribute: invalid args');
      return null;
    }
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`getOfferAttribute: The offer id: ${offerID} is not stored`);
      return null;
    }

    const offerAttr = container.offer_attrs[attrID];
    if (!offerAttr) {
      return null;
    }
    return offerAttr.attr;
  }

  /**
   * will return the metadata of a display id for a particular actionID and displayID.
   * @param  {[type]} displayID  [description]
   * @param  {[type]} actionID [description]
   * @return {object} the metadata for an action and displayID or null if not found
   * <pre>
   * {
   *   c_ts: timestamp,
   *   l_u_ts: timestamp,
   *   count: N,
   * }
   * </pre>
   */
  getOfferDisplayActionMeta(displayID, actionID) {
    const displayMap = this.dataIndex.display_id_index;
    const container = displayMap[displayID];
    if (!container || !actionID) {
      return null;
    }
    return container[actionID];
  }

  /**
   * will return the associated campaign id for a particular offer, or null if not found
   * @param  {[type]} offerID [description]
   * @return {[type]}         [description]
   */
  getCampaignID(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      return null;
    }
    return container.offer_obj.campaign_id;
  }

  /**
   * will return a set of all offers ids associated to a campaign, or null if no
   * campaign is found
   * @param  {[type]} campaignID [description]
   * @return {[type]}            [description]
   */
  getCampaignOffers(campaignID) {
    if (!campaignID) {
      return null;
    }
    return this.campaignToOffersMap[campaignID];
  }

  /**
   * this method will check on the given set of offers ids which is the offer
   * that was latest updated and still on the DB (i/e not removed).
   * @param  {[type]} offersIDsSet [description]
   * @return {list}              sorted list (by latest updated offer) of objects
   * with the following information:
   * {
   *   l_u_ts: ts,
   *   offer_id: offer id,
   *   campaign_id: cid,
   * }
   */
  getLatestUpdatedOffer(offersIDsSet) {
    if (!offersIDsSet) {
      return null;
    }

    const sortedOffers = [];
    const self = this;
    offersIDsSet.forEach((oid) => {
      const offerCont = self.dataIndex.offers_index[oid];
      if (!offerCont || offerCont.removed === true || !offerCont.offer_obj) {
        return;
      }

      sortedOffers.push({
        offer_id: offerCont.offer_obj.offer_id,
        campaign_id: offerCont.offer_obj.campaign_id,
        last_update: offerCont.l_u_ts,
      });
    });
    // we will sort using the last update field and putting the latest update
    sortedOffers.sort((a, b) => b.last_update - a.last_update);

    return sortedOffers;
  }

  /**
   * will retrieve all the offers we have applying filters and also sorting given
   * on the options argument.
   * @param  {object} opt containing the filter and sorting options:
   * <pre>
   * {
   *   filter: {
   *     // the dest field will be used just to query all the offers that
   *     // belong to a particular destination (on the list).
   *     // If the offer destination field is on the list will be returned
   *     dest: ['dest1', ...]
   *   },
   *   // how we want to sort the list, for now will be the newest first, olders
   *   // at the end
   *   sort: 'c_ts' or 'l_u_ts',
   * }
   * </pre>
   * @return {[type]}     [description]
   */
  getOffers(/* opt */) {
    // for now we will list all the current offers and return them in a list
    const offers = [];
    const self = this;
    Object.keys(this.dataIndex.offers_index).forEach((offerID) => {
      const cont = self.dataIndex.offers_index[offerID];
      // we add it if we have the offer object only
      if (cont.offer_obj && !cont.removed) {
        const offerInfo = {
          offer_id: cont.offer_obj.offer_id,
          offer: cont.offer_obj,
          last_update: cont.l_u_ts,
          created: cont.c_ts
        };
        offers.push(offerInfo);
      }
    });

    return offers;
  }

  // ---------------------------------------------------------------------------
  // The "private" methods will go here
  // ---------------------------------------------------------------------------

  /**
   * will return a basic container for every element we want to track: actions,
   * attributes, etc
   * @return {[type]} [description]
   * <pre>
   *   {
   *     c_ts: ts,
   *     l_u_ts: ts
   *   }
   * </pre>
   */
  _createElementContainer() {
    const now = timestampMS();
    return {
      c_ts: now,
      l_u_ts: now,
    };
  }

  /**
   * this method will mark an offer as index, to improve the saving step
   * @param  {[type]} offerID [description]
   * @return {[type]}         [description]
   */
  _markOfferDirty() {
    // TODO: for now we will just mark a flag that is dirty
    this.dbDirty = true;
  }

  /**
   * check validity of an offer
   * @param  {[type]}  offerID   [description]
   * @param  {[type]}  offerData [description]
   * @return {Boolean} true on success | false otherwise
   */
  _isOfferValid(offerID, offerData) {
    if (!offerID ||
        !offerData ||
        !offerData.offer_id ||
        offerData.offer_id !== offerID ||
        !offerData.display_id ||
        !offerData.campaign_id) {
      return false;
    }
    return true;
  }

  /**
   * will create a new container (metadata) for an offerID
   * @return {object} that should be inserted on the index.
   * <pre>
   * {
   *   c_ts: ts,
   *   l_u_ts: ts,
   *   offer_obj: null,
   *   offer_attrs: {},
   *   offer_actions: {}, // the "history signals",
   *   removed: false,  // if it was removed or not from DB
   * }
   * </pre>
   */
  _createOfferContainer() {
    const now = timestampMS();
    return {
      c_ts: now,
      l_u_ts: now,
      offer_obj: null,
      offer_attrs: {},
      offer_actions: {},
      removed: false,
    };
  }

  /**
   * will remove old entries from the main index
   * @return {[type]} [description]
   */
  _removeOldEntries() {
    const self = this;
    const now = timestampMS();
    const expTimeMs = OffersConfigs.OFFERS_STORAGE_DEFAULT_TTS_SECS * 1000;
    let dirty = false;
    Object.keys(this.dataIndex.offers_index).forEach((offerID) => {
      const cont = self.dataIndex.offers_index[offerID];
      // check delta
      const delta = now - cont.l_u_ts;
      if (delta >= expTimeMs) {
        // we need to remove this.
        dirty = true;
        logger.info(`_removeOldEntries: removing old offer ${offerID} with delta time: ${delta}`);
        self._removeIndexTablesForOffer(offerID);
        delete self.dataIndex.offers_index[offerID];
      }
    });

    if (dirty) {
      this.dbDirty = true;
    }
  }

  /**
   * will add all the needed mappings on the tables for a particular offerID.
   * The offer should be added into the main index before calling this method.
   * @param  {[type]} offerID [description]
   * @return {[type]}         [description]
   */
  _updateIndexTablesForOffer(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`_updateIndexTablesForOffer: The offer id: ${offerID} is not stored`);
      return false;
    }
    const displayID = container.offer_obj.display_id;
    if (!this.dataIndex.display_id_index[displayID]) {
      this.dataIndex.display_id_index[displayID] = {};
    }
    if (this.displayIDCounter[displayID]) {
      this.displayIDCounter[displayID] += 1;
    } else {
      this.displayIDCounter[displayID] = 1;
    }

    this._addOfferInCampaignMap(container.offer_obj);

    return true;
  }

  /**
   * remove entries on the maps (index tables) for a given offer (that should still
   * be on the DB main index).
   * @param  {[type]} offerID [description]
   * @return {[type]}         [description]
   */
  _removeIndexTablesForOffer(offerID) {
    const container = this.dataIndex.offers_index[offerID];
    if (!container) {
      logger.warn(`_removeIndexTablesForOffer: The offer id: ${offerID} is not stored`);
      return false;
    }
    const displayID = container.offer_obj.display_id;
    this.displayIDCounter[displayID] -= 1;
    if (this.displayIDCounter[displayID] <= 0) {
      // we need to remove this from the display_id_index
      delete this.dataIndex.display_id_index[displayID];
      this.dbDirty = true;
    }
    return true;
  }

  /**
   * will build all the needed index tables here.
   * @return {[type]} [description]
   */
  _buildIndexTables() {
    const self = this;
    Object.keys(this.dataIndex.offers_index).forEach((offerID) => {
      self._updateIndexTablesForOffer(offerID);
    });
  }

  /**
   * will save the main index, all the others should be built from this one
   */
  _savePersistentData() {
    if (!OffersConfigs.LOAD_OFFERS_STORAGE_DATA) {
      logger.info('_savePersistentData: skipping saving offers DB');
      return Promise.resolve(true);
    }

    if (!this.dbDirty) {
      return Promise.resolve(true);
    }

    return this.db.saveDocData(STORAGE_DB_DOC_ID,
      {
        data_index: this.dataIndex
      }
    ).then(() => {
      this.dbDirty = false;
      return Promise.resolve(true);
    });
  }

  /**
   * will load the main index and
   * return the Promise on success.
   */
  _loadPersistentData() {
    if (!OffersConfigs.LOAD_OFFERS_STORAGE_DATA) {
      logger.info('_loadPersistenceData: skipping the load of storage data');
      return new Promise((resolve) => { resolve(true); });
    }
    const self = this;
    return new Promise((resolve) => {
      this.db.getDocData(STORAGE_DB_DOC_ID).then((docData) => {
        if (!docData || !docData.data_index) {
          logger.error('_loadPersistenceData: something went wrong loading the data?');
          resolve(false);
          return;
        }
        // set the data
        self.dataIndex = docData.data_index;

        // remove the old ones
        self._removeOldEntries();

        // build tables
        self._buildIndexTables();

        self.dbDirty = false;
        resolve(true);
      }).catch((err) => {
        logger.error(`_loadPersistenceData: error loading the storage data...: ${JSON.stringify(err)}`);
        resolve(false);
      });
    });
  }

  _addOfferInCampaignMap(offer) {
    if (!offer || !offer.offer_id || !offer.campaign_id) {
      return;
    }
    let cset = this.campaignToOffersMap[offer.campaign_id];
    if (!cset) {
      cset = new Set();
      this.campaignToOffersMap[offer.campaign_id] = cset;
    }
    cset.add(offer.offer_id);
  }

  // ///////////////////////////////////////////////////////////////////////////
  // DEBUG HELPER METHODS
  // ///////////////////////////////////////////////////////////////////////////
  //

  /**
   * will remove the current database and store an empty element on the storage
   */
  __removePersistenLocalDB() {
    logger.info('__removePersistenLocalDB: removing current data and DB');
    this.dataIndex = {
      offers_index: {},
      display_id_index: {}
    };
    this.db.saveDocData(STORAGE_DB_DOC_ID,
      {
        data_index: this.dataIndex
      }
    );
  }
}

export default OfferDB;
