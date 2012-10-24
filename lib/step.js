/*
Copyright (c) 2011 Tim Caswell <tim@creationix.com>

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Inspired by http://github.com/willconant/flow-js, but reimplemented and
// modified to fit my taste and the node.JS error handling system.
function Step() {
  var steps = Array.prototype.slice.call(arguments),
      pending, counter, results, lock, parallel_done;

  // Define the main callback that's given as `this` to the steps.
  function next() {
    if (counter > 0 && pending != 0) report("next called while pending > 0");
    if (counter > 0 && !parallel_done) report("parallel calls, but no completion");
    counter = pending = 0; parallel_done = false;

    // Check if there are no steps left
    if (steps.length === 0) {
      // Throw uncaught errors
      if (arguments[0]) {
        throw arguments[0];
      }
      return;
    }

    // Get the next step to execute
    var fn = steps.shift();
    results = [];

    // Run the step in a try..catch block so exceptions don't get out of hand.
    try {
      lock = true;
      var result = fn.apply(next, arguments);
    } catch (e) {
      // Pass any exceptions on through the next callback
      next(e);
    }

    if (counter > 0 && pending == 0) {
      // If parallel() was called, and all parallel branches executed
      // syncronously, go on to the next step immediately.
      if (parallel_done) report("parallel already finished"); parallel_done = true;
      next.apply(null, results);
    } else if (result !== undefined) {
      // If a syncronous return is used, pass it to the callback
      next(undefined, result);
    }
    lock = false;
  }

  // Add a special callback generator `this.parallel()` that groups stuff.
  next.parallel = function () {
    var index = 1 + counter++, called = false;
    pending++;

    return function () {
      if (called) report("parallel cb was called twice"); called = true;
      pending--;
      // Compress the error from any result to the first argument
      if (arguments[0]) {
        results[0] = arguments[0];
      }
      // Send the other results as arguments
      results[index] = arguments[1];
      if (!lock && pending === 0) {
        // When all parallel branches done, call the callback
        if (parallel_done) report("parallel already finished"); parallel_done = true;
        next.apply(null, results);
      }
    };
  };

  // Generates a callback generator for grouped results
  next.group = function () {
    var localCallback = next.parallel();
    var counter = 0;
    var pending = 0;
    var result = [];
    var error = undefined;
    var group_done = false;

    function check() {
      // BUGFIX: check group_done to avoid calling localCallback twice;
      // still trying to determine how this comes about, but it does.
      if (pending === 0 && !group_done) {
        // When group is done, call the callback
        if (group_done) report("group was completed twice"); group_done = true;
        localCallback(error, result);
      }
    }
    process.nextTick(check); // Ensures that check is called at least once

    // Generates a callback for the group
    return function () {
      var index = counter++, called = false;
      pending++;
      return function () {
        if (called) report("group cb was called twice"); called = true;
        pending--;
        // Compress the error from any result to the first argument
        if (arguments[0]) {
          error = arguments[0];
        }
        // Send the other results as arguments
        result[index] = arguments[1];
        if (!lock) { check(); }
      };
    };
  };

  // Start the engine an pass nothing to the first step.
  next();
}

function report(err) {
    console.log("Step: "+err); // make sure we see it.
    throw new Error(err); // stop processing.
}

// Tack on leading and tailing steps for input and output and return
// the whole thing as a function.  Basically turns step calls into function
// factories.
Step.fn = function StepFn() {
  var steps = Array.prototype.slice.call(arguments);
  return function () {
    var args = Array.prototype.slice.call(arguments);

    // Insert a first step that primes the data stream
    var toRun = [function () {
      this.apply(null, args);
    }].concat(steps);

    // If the last arg is a function add it as a last step
    if (typeof args[args.length-1] === 'function') {
      toRun.push(args.pop());
    }


    Step.apply(null, toRun);
  }
}


// Hook into commonJS module systems
if (typeof module !== 'undefined' && "exports" in module) {
  module.exports = Step;
}
