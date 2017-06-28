/* global chai */
/* global describeModule */
/* global require */
/* eslint-disable func-names */

import { MAMetrics } from 'market-analysis/model/ma_signal';

export default describeModule('market-analysis/common/session_checker',
  () => ({
    'market-analysis/common/logger': {
      default: {
        log: () => {},
        debug: () => {},
        logObject: () => {},
        error: (msg) => { throw new Error(msg); }
      }
    }
  }),
  () => {
    describe('test function', () => {
      let SessionChecker;

      beforeEach(function () {
        SessionChecker = this.module().default;
      });

      it('check isNewSession function - metrics for 30 min session', () => {
        const metrics = [
          MAMetrics.VISIT,
          MAMetrics.REGISTRATION,
          MAMetrics.CHECKOUT,
          MAMetrics.TRANSACTION
        ];

        metrics.forEach((metric) => {
          const sessionChecker = new SessionChecker();
          sessionChecker.toString();
          const domain = 'amazon.de';
          const domain2 = 'ebay.de';

          const visitDate = new Date();
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          visitDate.setMinutes(visitDate.getMinutes() + 1);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(false);

          visitDate.setMinutes(visitDate.getMinutes() + 29);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(false);

          visitDate.setMinutes(visitDate.getMinutes() + 30);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          visitDate.setMinutes(visitDate.getMinutes() + 5);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(false);

          sessionChecker.isNewSession(domain2, metric, visitDate);
          chai.expect(sessionChecker.domainToLastVisit.size).eql(2);
        });
      });

      it('check isNewSession function - metrics for 5 min session', () => {
        const metrics = [
          MAMetrics.SHOPPING,
        ];

        metrics.forEach((metric) => {
          const sessionChecker = new SessionChecker();
          sessionChecker.toString();
          const domain = 'amazon.de';
          const domain2 = 'ebay.de';

          const visitDate = new Date();
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          visitDate.setMinutes(visitDate.getMinutes() + 1);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(false);

          visitDate.setMinutes(visitDate.getMinutes() + 4);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(false);

          visitDate.setMinutes(visitDate.getMinutes() + 29);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          visitDate.setMinutes(visitDate.getMinutes() + 30);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          visitDate.setMinutes(visitDate.getMinutes() + 5);
          chai.expect(sessionChecker.isNewSession(domain, metric, visitDate)).eql(true);

          sessionChecker.isNewSession(domain2, metric, visitDate);
          chai.expect(sessionChecker.domainToLastVisit.size).eql(2);
        });
      });
    });
  }
);
