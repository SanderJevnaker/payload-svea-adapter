'use client'

import React, { useEffect, useRef } from 'react'

export interface SveaCheckoutContainerProps {
  /**
   * The HTML snippet returned from Svea's create order response
   */
  snippet: string
  /**
   * Optional ID for the container element
   * @default 'svea-checkout-container'
   */
  containerId?: string
  /**
   * Optional class name for the container element
   */
  className?: string
}

/**
 * Component for rendering the Svea Checkout snippet
 *
 * This component safely injects and executes the Svea checkout HTML/JS snippet
 * returned from the initiatePayment call.
 *
 * @example
 * ```tsx
 * import { SveaCheckoutContainer } from '@sanderjevnaker/payload-svea-adapter/components'
 *
 * function CheckoutPage() {
 *   const [snippet, setSnippet] = useState<string | null>(null)
 *
 *   // After calling initiatePayment('svea')
 *   // setSnippet(response.checkoutSnippet)
 *
 *   if (!snippet) return null
 *
 *   return <SveaCheckoutContainer snippet={snippet} />
 * }
 * ```
 */
export const SveaCheckoutContainer: React.FC<SveaCheckoutContainerProps> = ({
  snippet,
  containerId = 'svea-checkout-container',
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const scriptsExecutedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || scriptsExecutedRef.current) return

    // Parse the HTML snippet
    const parser = new DOMParser()
    const doc = parser.parseFromString(snippet, 'text/html')

    // Find the Svea checkout container div
    const containerDiv = doc.querySelector('[data-sco-sveacheckout]')
    if (containerDiv) {
      containerRef.current.innerHTML = containerDiv.outerHTML
    }

    // Execute any scripts in the snippet
    const scripts = doc.querySelectorAll('script')
    const executedScripts: HTMLScriptElement[] = []

    scripts.forEach((script) => {
      // Skip if script with same src already exists
      if (script.src) {
        const existing = document.querySelector(`script[src="${script.src}"]`)
        if (existing) return
      }

      // Create new script element
      const newScript = document.createElement('script')
      Array.from(script.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value)
      })

      if (script.src) {
        newScript.src = script.src
      } else {
        newScript.textContent = script.textContent
      }

      document.head.appendChild(newScript)
      executedScripts.push(newScript)
    })

    scriptsExecutedRef.current = true

    // Cleanup function
    return () => {
      executedScripts.forEach((script) => {
        if (script.parentNode) {
          script.parentNode.removeChild(script)
        }
      })
      scriptsExecutedRef.current = false
    }
  }, [snippet])

  return <div ref={containerRef} id={containerId} className={className} />
}

