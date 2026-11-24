import { describe, it, expect, vi } from 'vitest'
import { RestrictiveSafeFetchPolicy, PermissiveSafeFetchPolicy } from './safe-fetch.js'
import { ResourceMeter } from './resource-limits.js'

describe('RestrictiveSafeFetchPolicy', () => {
  const policy = new RestrictiveSafeFetchPolicy()

  describe('scheme restrictions', () => {
    it('blocks file: scheme', async () => {
      const result = await policy.shouldBlock('file:///etc/passwd')
      expect(result.block).toBe(true)
      expect(result.reason).toContain('scheme')
    })

    it('blocks data: scheme', async () => {
      const result = await policy.shouldBlock('data:text/html,<h1>Hello</h1>')
      expect(result.block).toBe(true)
    })

    it('blocks javascript: scheme', async () => {
      const result = await policy.shouldBlock('javascript:alert(1)')
      expect(result.block).toBe(true)
    })

    it('allows public IP addresses', async () => {
      // Use known public IPs that should not be blocked
      const result1 = await policy.shouldBlock('http://104.20.23.154')
      expect(result1.block).toBe(false)
      
      const result2 = await policy.shouldBlock('http://1.1.1.1')
      expect(result2.block).toBe(false)
    })
  })

  describe('loopback addresses', () => {
    it('blocks 127.0.0.1 (decimal)', async () => {
      const result = await policy.shouldBlock('http://127.0.0.1')
      expect(result.block).toBe(true)
    })

    it('blocks 127.0.0.1 in hex (0x7f000001)', async () => {
      const result = await policy.shouldBlock('http://0x7f000001')
      expect(result.block).toBe(true)
    })

    it('blocks 127.0.0.1 in octal (0177.0.0.1)', async () => {
      const result = await policy.shouldBlock('http://0177.0.0.1')
      expect(result.block).toBe(true)
    })

    it('blocks 127.0.0.1 in decimal (2130706433)', async () => {
      const result = await policy.shouldBlock('http://2130706433')
      expect(result.block).toBe(true)
    })

    it('blocks ::1 (IPv6 loopback)', async () => {
      const result = await policy.shouldBlock('http://[::1]')
      expect(result.block).toBe(true)
    })
  })

  describe('private addresses', () => {
    it('blocks 10.0.0.1 (10.0.0.0/8)', async () => {
      const result = await policy.shouldBlock('http://10.0.0.1')
      expect(result.block).toBe(true)
    })

    it('blocks 172.16.0.1 (172.16.0.0/12)', async () => {
      const result = await policy.shouldBlock('http://172.16.0.1')
      expect(result.block).toBe(true)
    })

    it('blocks 192.168.1.1 (192.168.0.0/16)', async () => {
      const result = await policy.shouldBlock('http://192.168.1.1')
      expect(result.block).toBe(true)
    })

    it('blocks 100.64.0.1 (100.64.0.0/10)', async () => {
      const result = await policy.shouldBlock('http://100.64.0.1')
      expect(result.block).toBe(true)
    })
  })

  describe('link-local addresses', () => {
    it('blocks 169.254.0.1', async () => {
      const result = await policy.shouldBlock('http://169.254.0.1')
      expect(result.block).toBe(true)
    })

    it('blocks fe80::1', async () => {
      const result = await policy.shouldBlock('http://[fe80::1]')
      expect(result.block).toBe(true)
    })
  })

  describe('cloud metadata', () => {
    it('blocks AWS EC2 metadata (169.254.169.254)', async () => {
      const result = await policy.shouldBlock('http://169.254.169.254')
      expect(result.block).toBe(true)
    })

    it('blocks AWS EC2 metadata IPv6 (fd00:ec2::254)', async () => {
      const result = await policy.shouldBlock('http://[fd00:ec2::254]')
      expect(result.block).toBe(true)
    })

    it('blocks the Google Cloud metadata hostname without a DNS lookup', async () => {
      const result = await policy.shouldBlock('http://metadata.google.internal')
      expect(result.block).toBe(true)
    })
  })

  describe('public addresses', () => {
    it('allows 8.8.8.8 (Google DNS)', async () => {
      console.log('Testing 8.8.8.8...')
      const result = await policy.shouldBlock('http://8.8.8.8')
      console.log('Result:', result)
      expect(result.block).toBe(false)
    })

    it('allows 1.1.1.1 (Cloudflare DNS)', async () => {
      const result = await policy.shouldBlock('http://1.1.1.1')
      expect(result.block).toBe(false)
    })
  })
})

describe('PermissiveSafeFetchPolicy', () => {
  const policy = new PermissiveSafeFetchPolicy()

  it('allows 127.0.0.1', async () => {
    const result = await policy.shouldBlock('http://127.0.0.1')
    expect(result.block).toBe(false)
  })

  it('allows 192.168.1.1', async () => {
    const result = await policy.shouldBlock('http://192.168.1.1')
    expect(result.block).toBe(false)
  })

  it('blocks file: scheme', async () => {
    const result = await policy.shouldBlock('file:///etc/passwd')
    expect(result.block).toBe(true)
  })

  it('allows http: scheme', async () => {
    const result = await policy.shouldBlock('http://127.0.0.1')
    expect(result.block).toBe(false)
  })
})

describe('Error handling', () => {
  it('handles invalid URL gracefully', async () => {
    const restrictive = new RestrictiveSafeFetchPolicy()
    const result = await restrictive.shouldBlock('not-a-valid-url')
    expect(result.block).toBe(true)
  })
})

describe('safe-fetch modes and resolver seam (task 14)', () => {
  const publicLookup = async (): Promise<Array<{ address: string; family: number }>> => [{ address: '93.184.216.34', family: 4 }]

  it('reports its mode, and no policy mode means restrictive', () => {
    expect(new RestrictiveSafeFetchPolicy().mode).toBe('restrictive')
    expect(new PermissiveSafeFetchPolicy().mode).toBe('permissive')
  })

  it('allows a name that resolves only to public addresses and passes the name to the resolver', async () => {
    const lookup = vi.fn(publicLookup)
    const r = await new RestrictiveSafeFetchPolicy({ lookup }).shouldBlock('http://example.test/')
    expect(r).toEqual({ block: false, reason: '' })
    expect(lookup).toHaveBeenCalledWith('example.test')
  })

  it('blocks a name with one blocked address among public ones', async () => {
    const lookup = async (): Promise<Array<{ address: string; family: number }>> => [
      { address: '93.184.216.34', family: 4 },
      { address: '::ffff:10.0.0.1', family: 6 },
    ]
    const r = await new RestrictiveSafeFetchPolicy({ lookup }).shouldBlock('http://example.test/')
    expect(r.block).toBe(true)
    expect(r.reason).toContain('blocked IP address (private)')
  })

  it('fails closed on a resolver error', async () => {
    const lookup = async (): Promise<never> => {
      throw Object.assign(new Error('x'), { code: 'ENOTFOUND' })
    }
    const r = await new RestrictiveSafeFetchPolicy({ lookup }).shouldBlock('http://example.test/')
    expect(r.block).toBe(true)
    expect(r.reason).toContain('DNS resolution failed')
  })

  it('does not consult the resolver for an IP literal', async () => {
    const lookup = vi.fn(publicLookup)
    const r = await new RestrictiveSafeFetchPolicy({ lookup }).shouldBlock('http://10.0.0.1/')
    expect(r.block).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('ResourceMeter.wrapPolicy forwards the mode of the policy it wraps', () => {
    const meter = new ResourceMeter(() => undefined)
    expect(meter.wrapPolicy(new PermissiveSafeFetchPolicy()).mode).toBe('permissive')
    expect(meter.wrapPolicy(new RestrictiveSafeFetchPolicy()).mode).toBe('restrictive')
    expect(meter.wrapPolicy({ shouldBlock: async () => ({ block: false, reason: '' }) }).mode).toBeUndefined()
  })
})
