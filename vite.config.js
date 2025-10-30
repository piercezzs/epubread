import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import portfinder from 'portfinder'

export default defineConfig(async () => {
  portfinder.basePort = 5173
  const port = await portfinder.getPortPromise()
  return {
    plugins: [vue()],
    base: './',
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src')
      }
    },
    server: {
      port,
      host: true,
      strictPort: false
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'terser',
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  }
})