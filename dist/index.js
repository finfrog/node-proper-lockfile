'use strict';

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var lock = function () {
    var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(file, options) {
        var release;
        return _regenerator2.default.wrap(function _callee$(_context) {
            while (1) {
                switch (_context.prev = _context.next) {
                    case 0:
                        _context.next = 2;
                        return toPromise(lockfile.lock)(file, options);

                    case 2:
                        release = _context.sent;
                        return _context.abrupt('return', toPromise(release));

                    case 4:
                    case 'end':
                        return _context.stop();
                }
            }
        }, _callee, this);
    }));

    return function lock(_x, _x2) {
        return _ref.apply(this, arguments);
    };
}();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var lockfile = require('./lib/lockfile');

var _require = require('./lib/adapter'),
    toPromise = _require.toPromise,
    toSync = _require.toSync,
    toSyncOptions = _require.toSyncOptions;

function lockSync(file, options) {
    var release = toSync(lockfile.lock)(file, toSyncOptions(options));

    return toSync(release);
}

function unlock(file, options) {
    return toPromise(lockfile.unlock)(file, options);
}

function unlockSync(file, options) {
    return toSync(lockfile.unlock)(file, toSyncOptions(options));
}

function check(file, options) {
    return toPromise(lockfile.check)(file, options);
}

function checkSync(file, options) {
    return toSync(lockfile.check)(file, toSyncOptions(options));
}

module.exports = lock;
module.exports.lock = lock;
module.exports.unlock = unlock;
module.exports.lockSync = lockSync;
module.exports.unlockSync = unlockSync;
module.exports.check = check;
module.exports.checkSync = checkSync;