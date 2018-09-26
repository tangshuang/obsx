import Objext from './objext'
import {
  isArray,
  isObject,
  isInstanceOf,
  setProto,
  valueOf,
  makeKeyChain,
  assign,
} from './utils'

/**
 * 本页的所有target都必须是一个Objext的实例
 */

export function xset(target, path, value) {
  let chain = makeKeyChain(path)
  let key = chain.pop()
  let node = target

  for (let i = 0, len = chain.length; i < len; i ++) {
    let current = chain[i]
    let next = chain[i + 1] || key
    if (/[0-9]+/.test(next) && !isArray(node[current])) {
      xdefine(node, current, [])
    }
    else if (!isObject(node[current])) {
      xdefine(node, current, {})
    }
    node = node[current]
  }

  xdefine(node, key, value)
}

export function xdefine(target, key, value) {
  let data = xcreate(value, key, target)
  let $$ = data
  Object.defineProperty(target, key, {
    configurable : true,
    enumerable : true,
    set: (v) => {
      if (target.$$locked) {
        return
      }

      
      // 校验数据
      // 会冒泡上去
      target.$validate(key, v)
      
      let oldValue = valueOf($$)
      let data = xcreate(v, key, target)
      $$ = data

      // 触发watch
      // 会冒泡上去
      let newValue = valueOf(data)
      target.$dispatch(key, newValue, oldValue)

      // 改动$$data上的数据，由于父子节点之间的$$data是引用关系，因此，当子节点的这个动作被触发时，父节点的$$data也被修改了
      assign(target.$$data, key, newValue)
    },
    get() {
      /**
       * 这里需要详细解释一下
       * 由于依赖收集中$$dep仅在顶层的this中才会被给key和getter，因此，只能收集到顶层属性
       * 但是，由于在进行监听时，deep为true，因此，即使是只有顶层属性被监听，当顶层属性的深级属性变动时，这个监听也会被触发，因此也能带来依赖响应
       */
      if (target.$$dep && target.$$dep.key && target.$$dep.getter) {
        target.$$dep.dependency = key
        target.$$dep.target = target
        target.$dependent()
      }

      return $$
    },
  })
}

export function xcreate(value, key, target) {
  if (isInstanceOf(value, Objext)) {
    value.$define('$$key', key)
    value.$define('$$parent', target)
    return value
  }
  else if (isObject(value)) {
    return xobject(value, key, target)
  }
  else if (isArray(value)) {
    return xarray(value, key, target)
  }
  else {
    return value
  }
}
export function xobject(value, key, target) {
  let data = Object.assign({}, value)
  let objx = new Objext()

  objx.$define('$$key', key)
  objx.$define('$$parent', target)

  // 创建引用，这样当修改子节点的时候，父节点自动修改
  if (!target.$$data[key]) {
    target.$$data[key] = {}
  }
  Object.defineProperty(objx, '$$data', {
    configurable: true,
    get: () => target.$$data[key],
  })
  
  objx.$put(data)

  return objx
}
export function xarray(value, key, target) {
  // 创建引用，这样当修改子节点的时候，父节点自动修改
  if (!target.$$data[key]) {
    target.$$data[key] = []
  }
  //  创建一个proto作为一个数组新原型，这个原型的push等方法经过改造
  let proto = []
  let descriptors = {
    // 这些属性都是为了冒泡准备的，arra没有$set等设置相关的属性
    $$key: { value: key },
    $$parent: { value: target },
    $$data: { value: target.$$data[key] },
  }
  let methods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']
  methods.forEach((method) => {
    descriptors[method] = {
      value: function(...args) {
        // 这里注意：数组的这些方法没有校验逻辑，因为你不知道这些方法到底要对那个元素进行修改
        
        let oldValue = valueOf(this)
        
        Array.prototype[method].call(this, ...args)
        this.forEach((item, i) => {
          // 调整元素的path信息，该元素的子元素path也会被调整
          xdefine(this, i , item)
        })

        let newValue = valueOf(this)
        target.$dispatch(key, newValue, oldValue)
      }
    }
  })
  Object.defineProperties(proto, descriptors)
  // 用proto作为数组的原型
  let data = []
  setProto(data, proto)
  value.forEach((item, i) => {
    xdefine(data, i, item)
    target.$$data[key][i] = item
  })
  return data
}