'use strict';

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var path = require('path');
var fs = require('graceful-fs');
var retry = require('retry');
var onExit = require('signal-exit');

var locks = {};

function getLockFile(file, options) {
    return options.lockfilePath || file + '.lock';
}

function resolveCanonicalPath(file, options, callback) {
    if (!options.realpath) {
        return callback(null, path.resolve(file));
    }

    // Use realpath to resolve symlinks
    // It also resolves relative paths
    options.fs.realpath(file, callback);
}

function acquireLock(file, options, callback) {
    // Use mkdir to create the lockfile (atomic operation)
    options.fs.mkdir(getLockFile(file, options), function (err) {
        // If successful, we are done
        if (!err) {
            return callback();
        }

        // If error is not EEXIST then some other error occurred while locking
        if (err.code !== 'EEXIST') {
            return callback(err);
        }

        // Otherwise, check if lock is stale by analyzing the file mtime
        if (options.stale <= 0) {
            return callback((0, _assign2.default)(new Error('Lock file is already being held'), { code: 'ELOCKED', file: file }));
        }

        options.fs.stat(getLockFile(file, options), function (err, stat) {
            if (err) {
                // Retry if the lockfile has been removed (meanwhile)
                // Skip stale check to avoid recursiveness
                if (err.code === 'ENOENT') {
                    return acquireLock(file, (0, _extends3.default)({}, options, { stale: 0 }), callback);
                }

                return callback(err);
            }

            if (!isLockStale(stat, options)) {
                return callback((0, _assign2.default)(new Error('Lock file is already being hold'), { code: 'ELOCKED', file: file }));
            }

            // If it's stale, remove it and try again!
            // Skip stale check to avoid recursiveness
            removeLock(file, options, function (err) {
                if (err) {
                    return callback(err);
                }

                acquireLock(file, (0, _extends3.default)({}, options, { stale: 0 }), callback);
            });
        });
    });
}

function isLockStale(stat, options) {
    return stat.mtime.getTime() < Date.now() - options.stale;
}

function removeLock(file, options, callback) {
    // Remove lockfile, ignoring ENOENT errors
    options.fs.rmdir(getLockFile(file, options), function (err) {
        if (err && err.code !== 'ENOENT') {
            return callback(err);
        }

        callback();
    });
}

function updateLock(file, options) {
    var lock = locks[file];

    // Just for safety, should never happen
    /* istanbul ignore if */
    if (lock.updateTimeout) {
        return;
    }

    lock.updateDelay = lock.updateDelay || options.update;
    lock.updateTimeout = setTimeout(function () {
        var mtime = Date.now() / 1000;

        lock.updateTimeout = null;

        options.fs.utimes(getLockFile(file, options), mtime, mtime, function (err) {
            // Ignore if the lock was released
            if (lock.released) {
                return;
            }

            // Verify if we are within the stale threshold
            if (lock.lastUpdate <= Date.now() - options.stale && lock.lastUpdate > Date.now() - options.stale * 2) {
                var _err = (0, _assign2.default)(new Error(lock.updateError || 'Unable to update lock within the stale threshold'), { code: 'ECOMPROMISED' });

                return setLockAsCompromised(file, lock, _err);
            }

            // If the file is older than (stale * 2), we assume the clock is moved manually,
            // which we consider a valid case

            // If it failed to update the lockfile, keep trying unless
            // the lockfile was deleted!
            if (err) {
                if (err.code === 'ENOENT') {
                    return setLockAsCompromised(file, lock, (0, _assign2.default)(err, { code: 'ECOMPROMISED' }));
                }

                lock.updateError = err;
                lock.updateDelay = 1000;

                return updateLock(file, options);
            }

            // All ok, keep updating..
            lock.lastUpdate = Date.now();
            lock.updateError = null;
            lock.updateDelay = null;
            updateLock(file, options);
        });
    }, lock.updateDelay);

    // Unref the timer so that the nodejs process can exit freely
    // This is safe because all acquired locks will be automatically released
    // on process exit

    // We first check that `lock.updateTimeout.unref` exists because some users
    // may be using this module outside of NodeJS (e.g., in an electron app),
    // and in those cases `setTimeout` return an integer.
    /* istanbul ignore else */
    if (lock.updateTimeout.unref) {
        lock.updateTimeout.unref();
    }
}

function setLockAsCompromised(file, lock, err) {
    // Signal the lock has been released
    lock.released = true;

    // Cancel lock mtime update
    // Just for safety, at this point updateTimeout should be null
    /* istanbul ignore if */
    if (lock.updateTimeout) {
        clearTimeout(lock.updateTimeout);
    }

    if (locks[file] === lock) {
        delete locks[file];
    }

    lock.options.onCompromised(err);
}

// ----------------------------------------------------------

function lock(file, options, callback) {
    /* istanbul ignore next */
    options = (0, _extends3.default)({
        stale: 10000,
        update: null,
        realpath: true,
        retries: 0,
        fs: fs,
        onCompromised: function onCompromised(err) {
            throw err;
        }
    }, options);

    options.retries = options.retries || 0;
    options.retries = typeof options.retries === 'number' ? { retries: options.retries } : options.retries;
    options.stale = Math.max(options.stale || 0, 2000);
    options.update = options.update == null ? options.stale / 2 : options.update || 0;
    options.update = Math.max(Math.min(options.update, options.stale / 2), 1000);

    // Resolve to a canonical file path
    resolveCanonicalPath(file, options, function (err, file) {
        if (err) {
            return callback(err);
        }

        // Attempt to acquire the lock
        var operation = retry.operation(options.retries);

        operation.attempt(function () {
            acquireLock(file, options, function (err) {
                if (operation.retry(err)) {
                    return;
                }

                if (err) {
                    return callback(operation.mainError());
                }

                // We now own the lock
                var lock = locks[file] = {
                    options: options,
                    lastUpdate: Date.now()
                };

                // We must keep the lock fresh to avoid staleness
                updateLock(file, options);

                callback(null, function (releasedCallback) {
                    if (lock.released) {
                        return releasedCallback && releasedCallback((0, _assign2.default)(new Error('Lock is already released'), { code: 'ERELEASED' }));
                    }

                    // Not necessary to use realpath twice when unlocking
                    unlock(file, (0, _extends3.default)({}, options, { realpath: false }), releasedCallback);
                });
            });
        });
    });
}

function unlock(file, options, callback) {
    options = (0, _extends3.default)({
        fs: fs,
        realpath: true
    }, options);

    // Resolve to a canonical file path
    resolveCanonicalPath(file, options, function (err, file) {
        if (err) {
            return callback(err);
        }

        // Skip if the lock is not acquired
        var lock = locks[file];

        if (!lock) {
            return callback((0, _assign2.default)(new Error('Lock is not acquired/owned by you'), { code: 'ENOTACQUIRED' }));
        }

        lock.updateTimeout && clearTimeout(lock.updateTimeout); // Cancel lock mtime update
        lock.released = true; // Signal the lock has been released
        delete locks[file]; // Delete from locks

        removeLock(file, options, callback);
    });
}

function check(file, options, callback) {
    options = (0, _extends3.default)({
        stale: 10000,
        realpath: true,
        fs: fs
    }, options);

    options.stale = Math.max(options.stale || 0, 2000);

    // Resolve to a canonical file path
    resolveCanonicalPath(file, options, function (err, file) {
        if (err) {
            return callback(err);
        }

        // Check if lockfile exists
        options.fs.stat(getLockFile(file, options), function (err, stat) {
            if (err) {
                // If does not exist, file is not locked. Otherwise, callback with error
                return err.code === 'ENOENT' ? callback(null, false) : callback(err);
            }

            // Otherwise, check if lock is stale by analyzing the file mtime
            return callback(null, !isLockStale(stat, options));
        });
    });
}

function getLocks() {
    return locks;
}

// Remove acquired locks on exit
/* istanbul ignore next */
onExit(function () {
    for (var file in locks) {
        var options = locks[file].options;

        try {
            options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {/* Empty */}
    }
});

module.exports.lock = lock;
module.exports.unlock = unlock;
module.exports.check = check;
module.exports.getLocks = getLocks;