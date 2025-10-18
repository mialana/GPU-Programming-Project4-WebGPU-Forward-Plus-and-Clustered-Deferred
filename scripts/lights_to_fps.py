import matplotlib.pyplot as plt
from matplotlib.ticker import ScalarFormatter

# Light counts and FPS data
lights = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 100000]
fps_naive = [103, 53, 23, 12, 6, None, None, None, None]
fps_forward = [172, 173, 174, 171, 117, 50, 33, 22, 14]
fps_deferred = [173, 174, 176, 173, 171, 117, 80, 56, 25]

# Create figure
plt.figure(figsize=(8, 5))
plt.plot(lights[:5], fps_forward[:5], 'o-', label='Forward+')
plt.plot(lights[:5], fps_deferred[:5], 's-', label='Clustered Deferred')
plt.plot(lights[:5], fps_naive[:5], 'x-', label='Naive')

plt.xlabel('Number of Lights')
plt.ylabel('Frames Per Second (FPS)')

# Axis scaling and labels
plt.xscale('log')
ax = plt.gca()
ax.xaxis.set_major_formatter(ScalarFormatter())
ax.ticklabel_format(style='plain', axis='x')
plt.xticks(lights[:5], rotation=30)

# Add grid and legend
plt.grid(True, linestyle='--', alpha=0.4)
plt.legend()
plt.tight_layout()

# Add grid and legend
plt.grid(True, linestyle='--', alpha=0.4)
plt.legend()
plt.tight_layout()

# Save and show
plt.savefig("performance_comparison.png", dpi=300)
plt.show()
