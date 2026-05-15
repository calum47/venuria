'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type Props = {
  imageUrl: string
  onClose: () => void
}

export default function ThreeSixtyViewer({ imageUrl, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 0.1)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    // 360° sphere
    const geometry = new THREE.SphereGeometry(500, 60, 40)
    geometry.scale(-1, 1, 1) // flip inside out so texture faces inward

    const texture = new THREE.TextureLoader().load(imageUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    // Mouse drag to look around
    let isPointerDown = false
    let pointerX = 0
    let pointerY = 0
    let lon = 0
    let lat = 0
    let targetLon = 0
    let targetLat = 0

    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true
      pointerX = e.clientX
      pointerY = e.clientY
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return
      targetLon -= (e.clientX - pointerX) * 0.2
      targetLat += (e.clientY - pointerY) * 0.2
      pointerX = e.clientX
      pointerY = e.clientY
    }

    const onPointerUp = () => {
      isPointerDown = false
    }

    // Scroll to zoom
    let fov = 75
    const onWheel = (e: WheelEvent) => {
      fov += e.deltaY * 0.05
      fov = Math.max(30, Math.min(100, fov))
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('wheel', onWheel)

    // Handle resize
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // Animation loop
    let animFrameId: number
    const animate = () => {
      animFrameId = requestAnimationFrame(animate)

      // Smooth camera movement
      lon += (targetLon - lon) * 0.1
      lat += (targetLat - lat) * 0.1
      lat = Math.max(-85, Math.min(85, lat))

      const phi = THREE.MathUtils.degToRad(90 - lat)
      const theta = THREE.MathUtils.degToRad(lon)

      const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      )
      camera.lookAt(target)
      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animFrameId)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [imageUrl])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-white text-sm font-semibold">3D View</h2>
          <span className="text-white/40 text-xs">
            Drag to look around · Scroll to zoom
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-sm bg-white/10
                     hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
        >
          Back to Floor Plan
        </button>
      </div>

      {/* 360 viewer */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}