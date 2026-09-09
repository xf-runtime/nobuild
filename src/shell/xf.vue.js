//hariOm
var xfvue = (function (exports) {
    "use strict";

    // ---------- Core Utilities ----------
    const objectAssign = Object.assign;
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    const hasOwn = (obj, key) => hasOwnProperty.call(obj, key);
    const isArray = Array.isArray;
    const objectToString = Object.prototype.toString;
    const toRawType = val => objectToString.call(val);
    const isMap = val => toRawType(val) === "[object Map]";
    const isDate = val => toRawType(val) === "[object Date]";
    const isString = val => typeof val === "string";
    const isSymbol = val => typeof val === "symbol";
    const isObject = val => val !== null && typeof val === "object";
    const isIntegerKey = val => isString(val) && val !== "NaN" && val[0] !== "-" && String(parseInt(val, 10)) === val;

    const memoize = fn => {
        const cache = Object.create(null);
        return key => cache[key] || (cache[key] = fn(key));
    };

    const KEBAB_CASE_REGEX = /-(\w)/g;
    const camelize = memoize(str => str.replace(KEBAB_CASE_REGEX, (_, char) => char ? char.toUpperCase() : ""));

    const CAMEL_CASE_REGEX = /\B([A-Z])/g;
    const hyphenate = memoize(str => str.replace(CAMEL_CASE_REGEX, "-$1").toLowerCase());

    const looseToNumber = val => {
        const num = isString(val) ? Number(val) : NaN;
        return isNaN(num) ? val : num;
    };

    // ---------- Style & Class Normalization ----------
    function normalizeStyle(value) {
        if (isArray(value)) {
            const styleObject = {};
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                const parsed = isString(item) ? parseStyleString(item) : normalizeStyle(item);
                if (parsed) {
                    for (const key in parsed) styleObject[key] = parsed[key];
                }
            }
            return styleObject;
        }
        return isString(value) || isObject(value) ? value : undefined;
    }

    const STYLE_SEMICOLON_REGEX = /;(?![^(]*\))/g;
    const STYLE_COLON_REGEX = /:([^]+)/;
    const STYLE_COMMENT_REGEX = /\/\*[^]*?\*\//g;

    function parseStyleString(cssText) {
        const styleObject = {};
        const cleaned = cssText.replace(STYLE_COMMENT_REGEX, "");
        cleaned.split(STYLE_SEMICOLON_REGEX).forEach(item => {
            if (item) {
                const parts = item.split(STYLE_COLON_REGEX);
                if (parts.length > 1) styleObject[parts[0].trim()] = parts[1].trim();
            }
        });
        return styleObject;
    }

    function normalizeClass(value) {
        let classText = "";
        if (isString(value)) {
            classText = value;
        } else if (isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                const itemClass = normalizeClass(value[i]);
                if (itemClass) classText += itemClass + " ";
            }
        } else if (isObject(value)) {
            for (const key in value) {
                if (value[key]) classText += key + " ";
            }
        }
        return classText.trim();
    }

    // ---------- Deep Equality Comparison ----------
    function looseEqualArrays(arrA, arrB) {
        if (arrA.length !== arrB.length) return false;
        for (let i = 0; i < arrA.length; i++) {
            if (!looseEqual(arrA[i], arrB[i])) return false;
        }
        return true;
    }

    function looseEqual(a, b) {
        if (a === b) return true;

        const aIsDate = isDate(a), bIsDate = isDate(b);
        if (aIsDate || bIsDate) {
            return aIsDate && bIsDate && a.getTime() === b.getTime();
        }

        const aIsSymbol = isSymbol(a), bIsSymbol = isSymbol(b);
        if (aIsSymbol || bIsSymbol) return a === b;

        const aIsArray = isArray(a), bIsArray = isArray(b);
        if (aIsArray || bIsArray) {
            return aIsArray && bIsArray && looseEqualArrays(a, b);
        }

        const aIsObject = isObject(a), bIsObject = isObject(b);
        if (aIsObject || bIsObject) {
            if (!aIsObject || !bIsObject) return false;
            if (Object.keys(a).length !== Object.keys(b).length) return false;
            for (const key in a) {
                const hasOwnA = a.hasOwnProperty(key), hasOwnB = b.hasOwnProperty(key);
                if ((hasOwnA && !hasOwnB) || (!hasOwnA && hasOwnB) || !looseEqual(a[key], b[key])) {
                    return false;
                }
            }
        }

        return String(a) === String(b);
    }

    function looseIndexOf(arr, val) {
        return arr.findIndex(item => looseEqual(item, val));
    }

    // ---------- Core Reactivity System ----------
    function trackEffectInParentContext(effect, context) {
        if (context && context.active) context.effects.push(effect);
    }

    const createDep = effects => {
        const dep = new Set(effects);
        dep.w = 0;
        dep.n = 0;
        return dep;
    };

    const wasTracked = dep => (dep.w & trackOpBit) > 0;
    const newlyTracked = dep => (dep.n & trackOpBit) > 0;

    const targetMap = new WeakMap();
    let effectStackDepth = 0;
    let trackOpBit = 1;
    let activeEffect;
    const ITERATE_KEY = Symbol("");
    const MAP_KEY_ITERATE_KEY = Symbol("");

    class ReactiveEffect {
        constructor(fn, scheduler = null, context) {
            this.fn = fn;
            this.scheduler = scheduler;
            this.active = true;
            this.deps = [];
            this.parent = undefined;
            trackEffectInParentContext(this, context);
        }

        run() {
            if (!this.active) return this.fn();

            let current = activeEffect;
            while (current) {
                if (current === this) return;
                current = current.parent;
            }

            const previousShouldTrack = shouldTrack;

            try {
                this.parent = activeEffect;
                activeEffect = this;
                shouldTrack = true;

                trackOpBit = 1 << ++effectStackDepth;

                if (effectStackDepth <= 30) {
                    const { deps } = this;
                    for (let i = 0; i < deps.length; i++) {
                        deps[i].w |= trackOpBit;
                    }
                } else {
                    cleanupEffect(this);
                }

                return this.fn();
            } finally {
                if (effectStackDepth <= 30) {
                    const { deps } = this;
                    let newDepsIndex = 0;

                    for (let i = 0; i < deps.length; i++) {
                        const dep = deps[i];
                        if (wasTracked(dep) && !newlyTracked(dep)) {
                            dep.delete(this);
                        } else {
                            deps[newDepsIndex++] = dep;
                        }
                        dep.w &= ~trackOpBit;
                        dep.n &= ~trackOpBit;
                    }

                    deps.length = newDepsIndex;
                }

                trackOpBit = 1 << --effectStackDepth;
                activeEffect = this.parent;
                shouldTrack = previousShouldTrack;
                this.parent = undefined;

                if (this.deferStop) this.stop();
            }
        }

        stop() {
            if (activeEffect === this) {
                this.deferStop = true;
            } else if (this.active) {
                cleanupEffect(this);
                if (this.onStop) this.onStop();
                this.active = false;
            }
        }
    }

    function cleanupEffect(reactiveEffect) {
        const { deps } = reactiveEffect;
        if (deps.length > 0) {
            for (let i = 0; i < deps.length; i++) deps[i].delete(reactiveEffect);
            deps.length = 0;
        }
    }

    function stopEffect(runner) {
        runner.effect.stop();
    }

    let shouldTrack = true;
    const shouldTrackStack = [];

    function track(target, key) {
        if (!shouldTrack || !activeEffect) return;

        let depsMap = targetMap.get(target);
        if (!depsMap) targetMap.set(target, depsMap = new Map());

        let dep = depsMap.get(key);
        if (!dep) depsMap.set(key, dep = createDep());

        let shouldAdd = false;
        if (effectStackDepth <= 30) {
            if (!newlyTracked(dep)) {
                dep.n |= trackOpBit;
                shouldAdd = !wasTracked(dep);
            }
        } else {
            shouldAdd = !dep.has(activeEffect);
        }

        if (shouldAdd) {
            dep.add(activeEffect);
            activeEffect.deps.push(dep);
        }
    }

    function trigger(target, type, key, newValue) {
        const depsMap = targetMap.get(target);
        if (!depsMap) return;

        let depsToRun = [];

        if (type === "clear") {
            depsToRun = [...depsMap.values()];
        } else if (key === "length" && isArray(target)) {
            const newLength = Number(newValue);
            depsMap.forEach((dep, depKey) => {
                if (depKey === "length" || depKey >= newLength) depsToRun.push(dep);
            });
        } else {
            if (key !== undefined) depsToRun.push(depsMap.get(key));

            switch (type) {
                case "add":
                    if (isArray(target)) {
                        if (isIntegerKey(key)) depsToRun.push(depsMap.get("length"));
                    } else {
                        depsToRun.push(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) depsToRun.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                    break;
                case "delete":
                    if (!isArray(target)) {
                        depsToRun.push(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) depsToRun.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                    break;
                case "set":
                    if (isMap(target)) depsToRun.push(depsMap.get(ITERATE_KEY));
                    break;
            }
        }

        if (depsToRun.length === 1) {
            if (depsToRun[0]) triggerEffects(depsToRun[0]);
        } else {
            const allEffects = [];
            for (const dep of depsToRun) {
                if (dep) allEffects.push(...dep);
            }
            triggerEffects(createDep(allEffects));
        }
    }

    function triggerEffects(dep) {
        const effects = isArray(dep) ? dep : [...dep];
        for (const effect of effects) {
            if (effect.computed) runEffect(effect);
        }
        for (const effect of effects) {
            if (!effect.computed) runEffect(effect);
        }
    }

    function runEffect(effect) {
        if (effect !== activeEffect || effect.allowRecurse) {
            if (effect.scheduler) effect.scheduler();
            else effect.run();
        }
    }

    // ---------- Proxy Handlers & Reactive Object Creation ----------
    function makeLookup(commaSeparatedList) {
        const set = new Set(commaSeparatedList.split(","));
        return val => set.has(val);
    }

    const isSpecialGettableProperty = makeLookup("__proto__,__v_isRef,__isVue");

    const hiddenSymbolProperties = new Set(
        Object.getOwnPropertyNames(Symbol)
            .filter(name => name !== "arguments" && name !== "caller")
            .map(name => Symbol[name])
            .filter(isSymbol)
    );

    function createArrayInstrumentations() {
        const instrumentations = {};

        ["includes", "indexOf", "lastIndexOf"].forEach(key => {
            instrumentations[key] = function (...args) {
                const arr = toRaw(this);
                for (let i = 0, len = this.length; i < len; i++) track(arr, i + "");
                const result = arr[key](...args);
                if (result === -1 || result === false) {
                    return arr[key](...args.map(toRaw));
                }
                return result;
            };
        });

        ["push", "pop", "shift", "unshift", "splice"].forEach(key => {
            instrumentations[key] = function (...args) {
                shouldTrackStack.push(shouldTrack);
                shouldTrack = false;
                const result = toRaw(this)[key].apply(this, args);
                const previous = shouldTrackStack.pop();
                shouldTrack = previous === undefined ? true : previous;
                return result;
            };
        });

        return instrumentations;
    }

    const arrayInstrumentations = createArrayInstrumentations();

    function hasOwnTracked(key) {
        const target = toRaw(this);
        track(target, key);
        return target.hasOwnProperty(key);
    }

    function createGetter(isReadonlyGetter = false, isShallow = false) {
        return function get(target, key, receiver) {
            if (key === "__v_isReactive") return !isReadonlyGetter;
            if (key === "__v_isReadonly") return isReadonlyGetter;
            if (key === "__v_isShallow") return isShallow;

            if (key === "__v_raw") {
                const map = isReadonlyGetter
                    ? (isShallow ? shallowReadonlyMap : readonlyMap)
                    : (isShallow ? shallowReactiveMap : reactiveMap);
                if (receiver === map.get(target)) return target;
            }

            const isTargetArray = isArray(target);

            if (!isReadonlyGetter && isTargetArray && hasOwn(arrayInstrumentations, key)) {
                return Reflect.get(arrayInstrumentations, key, receiver);
            }

            const result = Reflect.get(target, key, receiver);

            const isHiddenKey = isSymbol(key) ? hiddenSymbolProperties.has(key) : isSpecialGettableProperty(key);
            if (isHiddenKey) return result;

            if (!isReadonlyGetter) track(target, key);
            if (isShallow) return result;

            if (isRef(result)) {
                return isTargetArray && isIntegerKey(key) ? result : result.value;
            }

            if (isObject(result)) {
                return isReadonlyGetter ? readonly(result) : reactive(result);
            }

            return result;
        };
    }

    const reactiveGet = createGetter();
    const readonlyGet = createGetter(true);

    function createSetter() {
        return function set(target, key, value, receiver) {
            let oldValue = target[key];

            if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) return false;

            if (!isShallowValue(value) && !isReadonly(value)) {
                oldValue = toRaw(oldValue);
                value = toRaw(value);
            }
            if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                oldValue.value = value;
                return true;
            }

            const hadKey = isArray(target) && isIntegerKey(key)
                ? Number(key) < target.length
                : hasOwn(target, key);

            const result = Reflect.set(target, key, value, receiver);

            if (target === toRaw(receiver)) {
                if (hadKey) {
                    if (!Object.is(value, oldValue)) trigger(target, "set", key, value);
                } else {
                    trigger(target, "add", key, value);
                }
            }

            return result;
        };
    }

    const mutableHandlers = {
        get: reactiveGet,
        set: createSetter(),
        deleteProperty(target, key) {
            const hadKey = hasOwn(target, key);
            const result = Reflect.deleteProperty(target, key);
            if (result && hadKey) trigger(target, "delete", key, undefined);
            return result;
        },
        has(target, key) {
            const result = Reflect.has(target, key);
            if (!isSymbol(key) || !hiddenSymbolProperties.has(key)) track(target, key);
            return result;
        },
        ownKeys(target) {
            track(target, isArray(target) ? "length" : ITERATE_KEY);
            return Reflect.ownKeys(target);
        }
    };

    const readonlyHandlers = {
        get: readonlyGet,
        set: () => true,
        deleteProperty: () => true
    };

    const reactiveMap = new WeakMap();
    const shallowReactiveMap = new WeakMap();
    const readonlyMap = new WeakMap();
    const shallowReadonlyMap = new WeakMap();

    function getReactivityType(value) {
        if (value.__v_skip || !Object.isExtensible(value)) return 0;
        const rawType = toRawType(value).slice(8, -1);
        switch (rawType) {
            case "Object":
            case "Array":
                return 1;
            case "Map":
            case "Set":
            case "WeakMap":
            case "WeakSet":
                return 2;
            default:
                return 0;
        }
    }

    function reactive(target) {
        if (isReadonly(target)) return target;
        return createReactiveObject(target, false, mutableHandlers, null, reactiveMap);
    }

    function readonly(target) {
        return createReactiveObject(target, true, readonlyHandlers, null, readonlyMap);
    }

    function createReactiveObject(target, isReadonlyFlag, baseHandlers, collectionHandlers, proxyMap) {
        if (!isObject(target)) return target;
        if (target.__v_raw && (!isReadonlyFlag || !target.__v_isReactive)) return target;

        const existingProxy = proxyMap.get(target);
        if (existingProxy) return existingProxy;

        const reactivityType = getReactivityType(target);
        if (reactivityType === 0) return target;

        const proxy = new Proxy(target, reactivityType === 2 ? collectionHandlers : baseHandlers);
        proxyMap.set(target, proxy);
        return proxy;
    }

    function isReadonly(value) {
        return !!(value && value.__v_isReadonly);
    }

    function toRaw(observed) {
        const raw = observed && observed.__v_raw;
        return raw ? toRaw(raw) : observed;
    }

    function isRef(value) {
        return !!(value && value.__v_isRef === true);
    }

    const isShallowValue = value => !!(value && value.__v_isShallow);

    // ---------- Scheduler ----------
    let isFlushing = false;
    const jobQueue = [];
    const resolvedPromise = Promise.resolve();
    const nextTick = fn => resolvedPromise.then(fn);

    function queueJob(job) {
        if (!jobQueue.includes(job)) jobQueue.push(job);
        if (!isFlushing) {
            isFlushing = true;
            nextTick(flushJobs);
        }
    }

    function flushJobs() {
        for (const job of jobQueue) job();
        jobQueue.length = 0;
        isFlushing = false;
    }

    // ---------- Directives: Logic & Helpers ----------
    const forceEnabledAttrsRegex = /^(spellcheck|draggable|form|list|type)$/;

    const bindDirective = ({ el: targetElement, get: evaluateBinding, effect: registerReactiveEffect, arg: bindingKey, modifiers: bindingModifiers }) => {
        let previousValue;

        if (bindingKey === "class") {
            targetElement._class = targetElement.className;
        }

        registerReactiveEffect(() => {
            const currentValue = evaluateBinding();

            if (bindingKey) {
                if (bindingModifiers?.camel) {
                    bindingKey = camelize(bindingKey);
                }
                applyBinding(targetElement, bindingKey, currentValue, previousValue);
            } else {
                for (const key in currentValue) {
                    applyBinding(targetElement, key, currentValue[key], previousValue && previousValue[key]);
                }
                for (const key in previousValue) {
                    if (!currentValue || !(key in currentValue)) {
                        applyBinding(targetElement, key, null);
                    }
                }
            }

            previousValue = currentValue;
        });
    };

    const applyBinding = (element, key, newValue, oldValue) => {
        if (key === "class") {
            const normalizedClass = normalizeClass(element._class ? [element._class, newValue] : newValue);
            element.setAttribute("class", normalizedClass || "");
            return;
        }

        if (key === "style") {
            newValue = normalizeStyle(newValue);
            const { style } = element;

            if (newValue) {
                if (isString(newValue)) {
                    if (newValue !== oldValue) style.cssText = newValue;
                } else {
                    for (const prop in newValue) setStyleProperty(style, prop, newValue[prop]);
                    if (oldValue && !isString(oldValue)) {
                        for (const prop in oldValue) {
                            if (newValue[prop] == null) setStyleProperty(style, prop, "");
                        }
                    }
                }
            } else {
                element.removeAttribute("style");
            }
            return;
        }

        const isSpecialAttr = element instanceof SVGElement || !(key in element) || forceEnabledAttrsRegex.test(key);

        if (isSpecialAttr) {
            if (key === "true-value") {
                element._trueValue = newValue;
            } else if (key === "false-value") {
                element._falseValue = newValue;
            } else if (newValue != null) {
                element.setAttribute(key, newValue);
            } else {
                element.removeAttribute(key);
            }
        } else {
            element[key] = newValue;
            if (key === "value") element._value = newValue;
        }
    };

    const importantRegex = /\s*!important$/;

    function setStyleProperty(style, name, value) {
        if (isArray(value)) {
            value.forEach(v => setStyleProperty(style, name, v));
        } else if (name.startsWith("--")) {
            style.setProperty(name, value);
        } else if (importantRegex.test(value)) {
            style.setProperty(hyphenate(name), value.replace(importantRegex, ""), "important");
        } else {
            style[name] = value;
        }
    }

    function getAndRemoveAttr(element, name) {
        const value = element.getAttribute(name);
        if (value != null) element.removeAttribute(name);
        return value;
    }

    function addListener(element, type, handler, options) {
        element.addEventListener(type, handler, options);
    }

    const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/;

    const modifierKeys = ["ctrl", "shift", "alt", "meta"];
    const eventModifiers = {
        stop: e => e.stopPropagation(),
        prevent: e => e.preventDefault(),
        self: e => e.target !== e.currentTarget,
        ctrl: e => !e.ctrlKey,
        shift: e => !e.shiftKey,
        alt: e => !e.altKey,
        meta: e => !e.metaKey,
        left: e => "button" in e && e.button !== 0,
        middle: e => "button" in e && e.button !== 1,
        right: e => "button" in e && e.button !== 2,
        exact: (e, mods) => modifierKeys.some(mod => e[`${mod}Key`] && !mods[mod])
    };

    const onDirective = ({ el, get, exp, arg, modifiers }) => {
        if (!arg) return;

        const isInlineFunction = exp.trim().startsWith("() =>") || exp.trim().startsWith("function");

        if (arg === "mount") {
            const mountHandler = isInlineFunction ? get(exp) : get(`() => { ${exp} }`);
            nextTick(() => mountHandler());
            return;
        }

        const rawHandler = isInlineFunction
            ? get(exp)
            : simplePathRE.test(exp)
                ? get(`(e) => ${exp}(e)`)
                : get(`(e) => { ${exp} }`);

        let handler = rawHandler;

        if (modifiers) {
            if (arg === "click" && modifiers.right) arg = "contextmenu";
            if (arg === "click" && modifiers.middle) arg = "mouseup";

            handler = event => {
                const hasKeyModifiers = "key" in event && Object.keys(modifiers).some(key => !eventModifiers[key]);
                if (!("key" in event) || !hasKeyModifiers || hyphenate(event.key) in modifiers) {
                    for (const modifierName in modifiers) {
                        const modifierFn = eventModifiers[modifierName];
                        if (modifierFn && modifierFn(event, modifiers)) return;
                    }
                    return rawHandler(event);
                }
            };
        }

        el.addEventListener(arg, handler, modifiers);
    };

    const textDirective = ({ el, get, effect }) => {
        effect(() => {
            el.textContent = toString(get());
        });
    };

    function toString(value) {
        if (value == null) return "";
        return isObject(value) ? JSON.stringify(value, null, 2) : String(value);
    }

    function getInputValue(element) {
        return "_value" in element ? element._value : element.value;
    }

    function getCheckboxValue(element, checked) {
        const key = checked ? "_trueValue" : "_falseValue";
        return key in element ? element[key] : checked;
    }

    function onCompositionStart(event) {
        event.target.composing = true;
    }

    function onCompositionEnd(event) {
        const target = event.target;
        if (target.composing) {
            target.composing = false;
            dispatchEvent(target, "input");
        }
    }

    function dispatchEvent(element, type) {
        const event = document.createEvent("HTMLEvents");
        event.initEvent(type, true, true);
        element.dispatchEvent(event);
    }

    const expressionCache = Object.create(null);

    function evaluate(scope, expression, element) {
        return evaluateAndCache(scope, `return(${expression})`, element);
    }

    function evaluateAndCache(scope, code, element) {
        const fn = expressionCache[code] || (expressionCache[code] = createExpressionFunction(code));
        try {
            return fn(scope, element);
        } catch (error) {
            console.error(error);
        }
    }

    function createExpressionFunction(code) {
        try {
            return new Function("$data", "$el", `with($data){${code}}`);
        } catch (error) {
            console.error(`${error.message} in expression: ${code}`);
            return () => {};
        }
    }

    const directives = {
        bind: bindDirective,
        on: onDirective,
        show: ({ el, get, effect }) => {
            const originalDisplay = el.style.display;
            effect(() => {
                el.style.display = get() ? originalDisplay : "none";
            });
        },
        text: textDirective,
        html: ({ el, get, effect }) => {
            effect(() => {
                el.innerHTML = get();
            });
        },
        model: ({ el, exp, get, effect, modifiers }) => {
            const inputType = el.type;
            const setValue = get(`(val) => { ${exp} = val }`);
            const { trim, number: shouldConvertToNumber = inputType === "number" } = modifiers || {};

            if (el.tagName === "SELECT") {
                const selectEl = el;

                addListener(selectEl, "change", () => {
                    const selectedValues = Array.prototype.filter
                        .call(selectEl.options, option => option.selected)
                        .map(option => shouldConvertToNumber ? looseToNumber(getInputValue(option)) : getInputValue(option));
                    setValue(selectEl.multiple ? selectedValues : selectedValues[0]);
                });

                effect(() => {
                    const currentValue = get();
                    const isMultiple = selectEl.multiple;

                    for (let i = 0, len = selectEl.options.length; i < len; i++) {
                        const option = selectEl.options[i];
                        const optionValue = getInputValue(option);

                        if (isMultiple) {
                            option.selected = isArray(currentValue)
                                ? looseIndexOf(currentValue, optionValue) > -1
                                : currentValue.has(optionValue);
                        } else if (looseEqual(optionValue, currentValue)) {
                            if (selectEl.selectedIndex !== i) selectEl.selectedIndex = i;
                            return;
                        }
                    }

                    if (!isMultiple && selectEl.selectedIndex !== -1) {
                        selectEl.selectedIndex = -1;
                    }
                });

            } else if (inputType === "checkbox") {
                let previousValue;

                addListener(el, "change", () => {
                    const currentValue = get();
                    const isChecked = el.checked;

                    if (isArray(currentValue)) {
                        const elementValue = getInputValue(el);
                        const existingIndex = looseIndexOf(currentValue, elementValue);
                        const alreadyIncluded = existingIndex !== -1;

                        if (isChecked && !alreadyIncluded) {
                            setValue(currentValue.concat(elementValue));
                        } else if (!isChecked && alreadyIncluded) {
                            const updated = [...currentValue];
                            updated.splice(existingIndex, 1);
                            setValue(updated);
                        }
                    } else {
                        setValue(getCheckboxValue(el, isChecked));
                    }
                });

                effect(() => {
                    const currentValue = get();
                    if (isArray(currentValue)) {
                        el.checked = looseIndexOf(currentValue, getInputValue(el)) > -1;
                    } else if (currentValue !== previousValue) {
                        el.checked = looseEqual(currentValue, getCheckboxValue(el, true));
                    }
                    previousValue = currentValue;
                });

            } else if (inputType === "radio") {
                let previousValue;

                addListener(el, "change", () => {
                    setValue(getInputValue(el));
                });

                effect(() => {
                    const currentValue = get();
                    if (currentValue !== previousValue) {
                        el.checked = looseEqual(currentValue, getInputValue(el));
                    }
                    previousValue = currentValue;
                });

            } else {
                const convertValue = value => {
                    if (trim) return value.trim();
                    if (shouldConvertToNumber) return looseToNumber(value);
                    return value;
                };

                addListener(el, "compositionstart", onCompositionStart);
                addListener(el, "compositionend", onCompositionEnd);
                addListener(el, modifiers && modifiers.lazy ? "change" : "input", () => {
                    if (!el.composing) setValue(convertValue(el.value));
                });

                if (trim) {
                    addListener(el, "change", () => {
                        el.value = el.value.trim();
                    });
                }

                effect(() => {
                    if (el.composing) return;
                    const domValue = el.value;
                    const boundValue = get();
                    if (document.activeElement === el && convertValue(domValue) === boundValue) return;
                    if (domValue !== boundValue) el.value = boundValue;
                });
            }
        },
        effect: ({ el, ctx, exp, effect }) => {
            nextTick(() => {
                effect(() => evaluateAndCache(ctx.scope, exp, el));
            });
        }
    };

    // ---------- v-for ----------
    const forDirective = (templateEl, expression, context) => {
        const match = expression.match(/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/);
        if (!match) return;

        const aliasRaw = match[1].trim().replace(/^\(|\)$/g, "").trim();
        const sourceExp = match[2].trim();

        const parentEl = templateEl.parentElement;
        const anchor = new Text("");
        parentEl.insertBefore(anchor, templateEl);
        parentEl.removeChild(templateEl);

        let itemAlias = aliasRaw;
        let indexAlias = null;
        let keyAlias = null;

        const aliasMatch = aliasRaw.match(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/);
        if (aliasMatch) {
            itemAlias = aliasRaw.replace(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/, "").trim();
            indexAlias = aliasMatch[1].trim();
            keyAlias = aliasMatch[2] ? aliasMatch[2].trim() : null;
        }

        const isDestructured = /^[{[]\s*((?:[\w_$]+\s*,?\s*)+)[\]}]$/.test(itemAlias);
        const destructuredKeys = isDestructured ? itemAlias.replace(/^[{[]|[\]}]$/g, "").split(",").map(k => k.trim()) : null;

        const keyAttr = templateEl.getAttribute("key") ||
            templateEl.getAttribute(":key") ||
            templateEl.getAttribute("v-bind:key");

        if (keyAttr) templateEl.removeAttribute("key");

        let previousBlocks = [];
        let initialized = false;

        const createScope = (value, index, key) => {
            const scopeVars = {};

            if (destructuredKeys) {
                destructuredKeys.forEach((k, i) => scopeVars[k] = value[i]);
            } else {
                scopeVars[itemAlias] = value;
            }

            if (indexAlias) scopeVars[indexAlias] = index;
            if (keyAlias) scopeVars[keyAlias] = key;

            const childContext = createChildContext(context, scopeVars);
            const blockKey = keyAttr ? evaluate(childContext.scope, keyAttr) : index;
            childContext.key = blockKey;

            return childContext;
        };

        const renderBlock = (scopeObj, insertBeforeEl) => {
            const block = new Block(templateEl, scopeObj);
            block.key = scopeObj.key;
            block.insert(parentEl, insertBeforeEl);
            return block;
        };

        context.effect(() => {
            const source = evaluate(context.scope, sourceExp);
            const newBlocksMap = new Map();
            const newScopes = [];

            if (Array.isArray(source)) {
                source.forEach((item, index) => {
                    const scopeObj = createScope(item, index);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                });
            } else if (typeof source === "number") {
                for (let i = 0; i < source; i++) {
                    const scopeObj = createScope(i + 1, i);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                }
            } else if (typeof source === "object") {
                let index = 0;
                for (const key in source) {
                    const scopeObj = createScope(source[key], index++, key);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                }
            }

            if (initialized) {
                previousBlocks.forEach(block => {
                    if (!newBlocksMap.has(block.key)) block.remove();
                });

                const updatedBlocks = [];
                let nextEl = anchor;
                for (let i = newScopes.length - 1; i >= 0; i--) {
                    const scopeObj = newScopes[i];
                    const existingIndex = previousBlocks.findIndex(b => b.key === scopeObj.key);
                    let block;

                    if (existingIndex === -1) {
                        block = renderBlock(scopeObj, nextEl);
                    } else {
                        block = previousBlocks[existingIndex];
                        Object.assign(block.context.scope, scopeObj.scope);

                        if (previousBlocks[existingIndex + 1] !== nextEl) {
                            block.insert(parentEl, nextEl);
                        }
                    }

                    updatedBlocks.unshift(block);
                    nextEl = block.el;
                }

                previousBlocks = updatedBlocks;
            } else {
                previousBlocks = newScopes.map(scopeObj => renderBlock(scopeObj, anchor));
                initialized = true;
            }
        });

        return templateEl.nextSibling;
    };

    // ---------- ref ----------
    const refDirective = ({ el, ctx, get, effect }) => {
        const refs = ctx.scope.$refs;
        let previousRefName;

        effect(() => {
            const currentRefName = get();
            refs[currentRefName] = el;
            if (previousRefName && currentRefName !== previousRefName) delete refs[previousRefName];
            previousRefName = currentRefName;
        });

        return () => {
            if (previousRefName) delete refs[previousRefName];
        };
    };

    // ---------- Template Walking ----------
    const directivePrefixRegex = /^(?:v-|:|@)/;
    const modifierRegex = /\.([\w-]+)/g;
    let isOnceActive = false;

    function handleIfDirective(el, expr, ctx) {
        const parent = el.parentElement;
        const anchor = new Comment("v-if");
        parent.insertBefore(anchor, el);

        const branches = [{ exp: expr, el }];
        let sibling, condition;

        while (
            (sibling = el.nextElementSibling) &&
            (condition = null, getAndRemoveAttr(sibling, "v-else") === "" || (condition = getAndRemoveAttr(sibling, "v-else-if")))
        ) {
            parent.removeChild(sibling);
            branches.push({ exp: condition, el: sibling });
        }

        const nextNode = el.nextSibling;
        parent.removeChild(el);

        let activeBlock, activeIndex = -1;

        const clearBlock = () => {
            if (activeBlock) {
                parent.insertBefore(anchor, activeBlock.el);
                activeBlock.remove();
                activeBlock = undefined;
            }
        };

        ctx.effect(() => {
            for (let i = 0; i < branches.length; i++) {
                const { exp, el: branchEl } = branches[i];
                if (!exp || evaluate(ctx.scope, exp)) {
                    if (i !== activeIndex) {
                        clearBlock();
                        activeBlock = new Block(branchEl, ctx);
                        activeBlock.insert(parent, anchor);
                        parent.removeChild(anchor);
                        activeIndex = i;
                    }
                    return;
                }
            }
            activeIndex = -1;
            clearBlock();
        });

        return nextNode;
    }

    function processNode(node, context) {
        if (node.nodeType === 1) {
            const element = node;
            if (element.hasAttribute("v-pre")) return;

            getAndRemoveAttr(element, "v-cloak");

            let directiveValue = getAndRemoveAttr(element, "v-if");
            if (directiveValue) return handleIfDirective(element, directiveValue, context);

            directiveValue = getAndRemoveAttr(element, "v-for");
            if (directiveValue) return forDirective(element, directiveValue, context);

            directiveValue = getAndRemoveAttr(element, "v-scope");
            if (directiveValue || directiveValue === "") {
                const scopeData = directiveValue ? evaluate(context.scope, directiveValue) : {};
                context = createChildContext(context, scopeData);
                if (scopeData.$template) renderTemplate(element, scopeData.$template);
            }

            const isOnce = getAndRemoveAttr(element, "v-once") != null;
            if (isOnce) isOnceActive = true;

            directiveValue = getAndRemoveAttr(element, "ref");
            if (directiveValue) applyDirective(element, refDirective, `"${directiveValue}"`, context);

            walkChildren(element, context);

            const directiveQueue = [];
            for (const { name, value } of [...element.attributes]) {
                if (directivePrefixRegex.test(name) && name !== "v-cloak") {
                    if (name === "v-model") {
                        directiveQueue.unshift([name, value]);
                    } else if (name[0] === "@" || /^v-on\b/.test(name)) {
                        directiveQueue.push([name, value]);
                    } else {
                        processSingleDirective(element, name, value, context);
                    }
                }
            }
            for (const [name, value] of directiveQueue) {
                processSingleDirective(element, name, value, context);
            }

            if (isOnce) isOnceActive = false;

        } else if (node.nodeType === 3) {
            const textContent = node.data;
            if (textContent.includes(context.delimiters[0])) {
                const tokens = [];
                let lastIndex = 0;
                let match;

                while ((match = context.delimitersRE.exec(textContent))) {
                    const staticText = textContent.slice(lastIndex, match.index);
                    if (staticText) tokens.push(JSON.stringify(staticText));
                    tokens.push(`$s(${match[1]})`);
                    lastIndex = match.index + match[0].length;
                }

                if (lastIndex < textContent.length) {
                    tokens.push(JSON.stringify(textContent.slice(lastIndex)));
                }

                applyDirective(node, textDirective, tokens.join("+"), context);
            }

        } else if (node.nodeType === 11) {
            walkChildren(node, context);
        }
    }

    function walkChildren(node, context) {
        let child = node.firstChild;
        while (child) {
            child = processNode(child, context) || child.nextSibling;
        }
    }

    function processSingleDirective(element, rawName, expression, context) {
        let directiveFn;
        let argument;
        const modifiers = {};

        const cleanedName = rawName.replace(modifierRegex, (_, mod) => {
            modifiers[mod] = true;
            return "";
        });

        if (cleanedName.startsWith(":")) {
            directiveFn = bindDirective;
            argument = cleanedName.slice(1);
        } else if (cleanedName.startsWith("@")) {
            directiveFn = onDirective;
            argument = cleanedName.slice(1);
        } else {
            const colonIndex = cleanedName.indexOf(":");
            const directiveName = colonIndex > 0 ? cleanedName.slice(2, colonIndex) : cleanedName.slice(2);
            argument = colonIndex > 0 ? cleanedName.slice(colonIndex + 1) : undefined;
            directiveFn = directives[directiveName] || context.dirs[directiveName];
        }

        if (directiveFn === bindDirective && argument === "ref") {
            directiveFn = refDirective;
        }

        if (directiveFn) {
            applyDirective(element, directiveFn, expression, context, argument, modifiers);
            element.removeAttribute(rawName);
        }
    }

    function applyDirective(element, directiveFn, expression, context, argument, modifiers) {
        const cleanupFn = directiveFn({
            el: element,
            get: (exp = expression) => evaluate(context.scope, exp, element),
            effect: context.effect,
            ctx: context,
            exp: expression,
            arg: argument,
            modifiers
        });

        if (cleanupFn) context.cleanups.push(cleanupFn);
    }

    function renderTemplate(element, templateSelectorOrHtml) {
        if (templateSelectorOrHtml[0] !== "#") {
            element.innerHTML = templateSelectorOrHtml;
        } else {
            const templateEl = document.querySelector(templateSelectorOrHtml);
            element.appendChild(templateEl.content.cloneNode(true));
        }
    }

    // ---------- Context ----------
    function createWrappedEffect(fn, options) {
        if (fn.effect) fn = fn.effect.fn;

        const reactiveEffect = new ReactiveEffect(fn);
        reactiveEffect.scheduler = () => queueJob(runner);

        if (options.scope) {
            trackEffectInParentContext(reactiveEffect, options.scope);
        }

        reactiveEffect.run();

        const runner = reactiveEffect.run.bind(reactiveEffect);
        runner.effect = reactiveEffect;

        return runner;
    }

    function createContext(options = {}) {
        const context = {
            delimiters: ["{{", "}}"],
            delimitersRE: /\{\{([^]+?)\}\}/g,
            ...options,
            scope: options.scope || reactive({}),
            dirs: options.dirs || {},
            effects: [],
            blocks: [],
            cleanups: [],
            effect(fn) {
                if (isOnceActive) {
                    queueJob(fn);
                    return fn;
                }

                const wrappedEffect = createWrappedEffect(fn, options);
                context.effects.push(wrappedEffect);
                return wrappedEffect;
            }
        };

        return context;
    }

    function createChildContext(parentContext, extraScope = {}) {
        const parentScope = parentContext.scope;
        const scope = Object.create(parentScope);
        Object.defineProperties(scope, Object.getOwnPropertyDescriptors(extraScope));
        scope.$refs = Object.create(parentScope.$refs);

        const reactiveScope = reactive(new Proxy(scope, {
            set: (target, key, value, receiver) => {
                if (receiver !== reactiveScope || target.hasOwnProperty(key)) {
                    return Reflect.set(target, key, value, receiver);
                }
                return Reflect.set(parentScope, key, value);
            }
        }));

        bindScopeMethods(reactiveScope);

        return { ...parentContext, scope: reactiveScope };
    }

    function bindScopeMethods(scope) {
        for (const key of Object.keys(scope)) {
            if (typeof scope[key] === "function") {
                scope[key] = scope[key].bind(scope);
            }
        }
    }

    // ---------- Block ----------
    class Block {
        get el() {
            return this.startNode || this.template;
        }

        constructor(sourceNode, contextOrParent, isRaw = false) {
            this.isFragment = sourceNode instanceof HTMLTemplateElement;

            if (isRaw) {
                this.template = sourceNode;
            } else if (this.isFragment) {
                this.template = sourceNode.content.cloneNode(true);
            } else {
                this.template = sourceNode.cloneNode(true);
            }

            if (isRaw) {
                this.context = contextOrParent;
            } else {
                this.parentContext = contextOrParent;
                contextOrParent.blocks.push(this);
                this.context = createContext(contextOrParent);
            }

            processNode(this.template, this.context);

            this.startNode = null;
            this.endNode = null;
        }

        insert(parentNode, anchorNode = null) {
            if (this.isFragment) {
                if (this.startNode) {
                    let current = this.startNode;
                    while (current) {
                        const next = current.nextSibling;
                        parentNode.insertBefore(current, anchorNode);
                        if (current === this.endNode) break;
                        current = next;
                    }
                } else {
                    this.startNode = new Text("");
                    this.endNode = new Text("");

                    parentNode.insertBefore(this.endNode, anchorNode);
                    parentNode.insertBefore(this.startNode, this.endNode);
                    parentNode.insertBefore(this.template, this.endNode);
                }
            } else {
                parentNode.insertBefore(this.template, anchorNode);
            }
        }

        remove() {
            if (this.parentContext) {
                const index = this.parentContext.blocks.indexOf(this);
                if (index > -1) this.parentContext.blocks.splice(index, 1);
            }

            if (this.startNode) {
                const parent = this.startNode.parentNode;
                let current = this.startNode;
                while (current) {
                    const next = current.nextSibling;
                    parent.removeChild(current);
                    if (current === this.endNode) break;
                    current = next;
                }
            } else if (this.template.parentNode) {
                this.template.parentNode.removeChild(this.template);
            }

            this.teardown();
        }

        teardown() {
            this.context.blocks.forEach(block => block.teardown());
            this.context.effects.forEach(stopEffect);
            this.context.cleanups.forEach(cleanup => cleanup());
        }
    }

    // ---------- App ----------
    function escapeRegex(str) {
        return str.replace(/[-.*+?^${}()|[\]\/\\]/g, "\\$&");
    }

    function createApp(initialData) {
        const context = createContext();

        if (initialData) {
            context.scope = reactive(initialData);
            bindScopeMethods(context.scope);

            if (initialData.$delimiters) {
                const [open, close] = context.delimiters = initialData.$delimiters;
                context.delimitersRE = new RegExp(escapeRegex(open) + "([^]+?)" + escapeRegex(close), "g");
            }
        }

        context.scope.$s = toString;
        context.scope.$nextTick = nextTick;
        context.scope.$refs = Object.create(null);

        let mountedBlocks;

        return {
            directive(name, fn) {
                if (fn) {
                    context.dirs[name] = fn;
                    return this;
                }
                return context.dirs[name];
            },
            mount(rootOrSelector) {
                let root = rootOrSelector;
                if (typeof root === "string") {
                    root = document.querySelector(root);
                    if (!root) return;
                }
                root = root || document.documentElement;

                let scopedElements = root.hasAttribute("v-scope")
                    ? [root]
                    : [...root.querySelectorAll("[v-scope]")].filter(el => !el.matches("[v-scope] [v-scope]"));

                if (!scopedElements.length) scopedElements = [root];

                mountedBlocks = scopedElements.map(el => new Block(el, context, true));
                return context.scope;
            },
            unmount() {
                mountedBlocks.forEach(block => block.teardown());
            }
        };
    }

    const currentScript = document.currentScript;
    if (currentScript && currentScript.hasAttribute("init")) {
        createApp().mount();
    }

    exports.createApp = createApp;
    exports.nextTick = nextTick;
    exports.reactive = reactive;

    return exports;
})({});