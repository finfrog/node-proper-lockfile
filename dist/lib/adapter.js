'use strict';

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fs = require('graceful-fs');

function createSyncFs(fs) {
    var methods = ['mkdir', 'realpath', 'stat', 'rmdir', 'utimes'];
    var newFs = (0, _extends3.default)({}, fs);

    methods.forEach(function (method) {
        newFs[method] = function () {
            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
            }

            var callback = args.pop();
            var ret = void 0;

            try {
                ret = fs[method + 'Sync'].apply(fs, args);
            } catch (err) {
                return callback(err);
            }

            callback(null, ret);
        };
    });

    return newFs;
}

// ----------------------------------------------------------

function toPromise(method) {
    return function () {
        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
        }

        return new _promise2.default(function (resolve, reject) {
            args.push(function (err, result) {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });

            method.apply(undefined, args);
        });
    };
}

function toSync(method) {
    return function () {
        for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
        }

        var err = void 0;
        var result = void 0;

        args.push(function (_err, _result) {
            err = _err;
            result = _result;
        });

        method.apply(undefined, args);

        if (err) {
            throw err;
        }

        return result;
    };
}

function toSyncOptions(options) {
    // Shallow clone options because we are oging to mutate them
    options = (0, _extends3.default)({}, options);

    // Transform fs to use the sync methods instead
    options.fs = createSyncFs(options.fs || fs);

    // Retries are not allowed because it requires the flow to be sync
    if (typeof options.retries === 'number' && options.retries > 0 || options.retries && typeof options.retries.retries === 'number' && options.retries.retries > 0) {
        throw (0, _assign2.default)(new Error('Cannot use retries with the sync api'), { code: 'ESYNC' });
    }

    return options;
}

module.exports = {
    toPromise: toPromise,
    toSync: toSync,
    toSyncOptions: toSyncOptions
};