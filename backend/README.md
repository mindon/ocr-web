Next.js backend

example **hello.ts**

```TypeScript
// Next.js style API routes <https://nextjs.org/>
export default function () {
  return new Response(`Hello biu~ ${new Date().toLocaleString()}`);
}
```
