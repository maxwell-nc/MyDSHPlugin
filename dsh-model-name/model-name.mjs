/**
 * dsh-model-name —— 共享「模型显示名规范化」库（宿主半边，占位）。
 *
 * 本插件几乎没有宿主侧功能：真正的内容在浏览器半边 lib/client.js —— 它注册成
 * 浏览器模块，暴露 normalize()/displayName() 等纯函数，供 usage / thinking 等
 * 客户端插件在渲染显示层时 require 复用。
 *
 * 设计上让宿主半边只做「占位 + 把包挂进插件树」，好让客户端半边被 client-modules
 * 自动发现（见 cordis.patch.yml 的注释）。以后若需要「可配置规则表 / Service」，
 * 再在这里加 Config 和 ctx.service，浏览器半边已有的 registerRule() 也能对接。
 *
 * 纯显示层原则：normalize 只改“显示 label”，绝不改存储/匹配用的 model id。
 */

export const name = 'dsh-model-name'

export function apply() {
  // 无宿主侧副作用；客户端半边在浏览器里自动挂载。
}

export default { name, apply }