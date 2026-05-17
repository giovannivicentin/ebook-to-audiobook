type PromiseWithResolvers = {
  promise: Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

const PromiseCompat = Promise as PromiseConstructor & {
  withResolvers?: <T>() => {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
  }
  try?: <T>(
    callback: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ) => Promise<T>
}

if (typeof PromiseCompat.withResolvers !== 'function') {
  PromiseCompat.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

if (typeof PromiseCompat.try !== 'function') {
  PromiseCompat.try = function promiseTry<T>(
    callback: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ) {
    return new Promise<T>((resolve) => {
      resolve(callback(...args))
    })
  }
}

if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(index: number) {
      const len = this.length >>> 0
      const normalized = index >= 0 ? index : len + index
      return normalized < 0 || normalized >= len ? undefined : this[normalized]
    },
    writable: true,
    configurable: true,
  })
}

if (typeof String.prototype.at !== 'function') {
  Object.defineProperty(String.prototype, 'at', {
    value: function at(index: number) {
      const str = String(this)
      const len = str.length
      const normalized = index >= 0 ? index : len + index
      return normalized < 0 || normalized >= len ? undefined : str.charAt(normalized)
    },
    writable: true,
    configurable: true,
  })
}

type TypedArrayWithAt = {
  readonly length: number
  [index: number]: unknown
}

type TypedArrayConstructorWithAt = {
  prototype: {
    at?: (index: number) => unknown
  }
}

const typedArrayConstructors = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  typeof BigInt64Array === 'function' ? BigInt64Array : undefined,
  typeof BigUint64Array === 'function' ? BigUint64Array : undefined,
].filter(Boolean) as TypedArrayConstructorWithAt[]

for (const ctor of typedArrayConstructors) {
  if (typeof ctor.prototype.at !== 'function') {
    Object.defineProperty(ctor.prototype, 'at', {
      value: function at(this: TypedArrayWithAt, index: number) {
        const len = this.length >>> 0
        const normalized = index >= 0 ? index : len + index
        return normalized < 0 || normalized >= len ? undefined : this[normalized]
      },
      writable: true,
      configurable: true,
    })
  }
}

if (typeof String.prototype.replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function replaceAll(
      searchValue: string | RegExp,
      replaceValue: string | ((substring: string, ...args: unknown[]) => string),
    ) {
      const str = String(this)

      if (searchValue instanceof RegExp) {
        if (!searchValue.global) {
          throw new TypeError('String.prototype.replaceAll called with a non-global RegExp')
        }
        return str.replace(searchValue, replaceValue as string)
      }

      const pattern = String(searchValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return str.replace(new RegExp(pattern, 'g'), replaceValue as string)
    },
    writable: true,
    configurable: true,
  })
}

if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast<T>(
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown,
    ) {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        const value = this[index]
        if (predicate.call(thisArg, value, index, this)) {
          return value
        }
      }
      return undefined
    },
    writable: true,
    configurable: true,
  })
}

if (typeof Array.prototype.findLastIndex !== 'function') {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function findLastIndex<T>(
      predicate: (value: T, index: number, array: T[]) => boolean,
      thisArg?: unknown,
    ) {
      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (predicate.call(thisArg, this[index], index, this)) {
          return index
        }
      }
      return -1
    },
    writable: true,
    configurable: true,
  })
}

void (PromiseCompat.withResolvers as (() => PromiseWithResolvers) | undefined)
